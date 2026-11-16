"""Scores a model on Nova's held-out prompts. No dependencies; needs Ollama running.

  python training/eval_routing.py qwen3:4b-instruct-2507-q4_K_M   # the base model
  python training/eval_routing.py nova-brain        # after fine-tuning

For each prompt in training/data/eval.jsonl it sends Nova's real system prompt and tools, then
checks the FIRST reply: did the model call exactly the right tools (or none), with a valid
task, in the same turn? Compare the two numbers. If tuned is not clearly higher, do not ship it.
"""

import json
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

model = sys.argv[1] if len(sys.argv) > 1 else "nova-brain"
url = (sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:11434") + "/api/chat"
rows = [json.loads(l) for l in open(Path(__file__).parent / "data" / "eval.jsonl", encoding="utf-8")]

ok = valid = 0
by_tool = defaultdict(lambda: [0, 0])
for i, r in enumerate(rows):
    body = {"model": model, "stream": False, "options": {"temperature": 0},
            "messages": r["messages"][:2], "tools": r["tools"]}
    req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json"})
    msg = json.load(urllib.request.urlopen(req, timeout=300))["message"]
    got = [c["function"]["name"] for c in msg.get("tool_calls") or []]
    want = r["expected_tools"]
    hit = sorted(got) == sorted(want)
    args_ok = all(isinstance((c["function"]["arguments"] or {}).get("task", "x"), str)
                  for c in msg.get("tool_calls") or [])
    ok += hit
    valid += hit and args_ok
    for t in set(want) or {"(no tool)"}:
        by_tool[t][1] += 1
        by_tool[t][0] += hit
    if not hit:
        print(f"MISS  {r['messages'][1]['content']!r}\n      wanted {want}, got {got}")
    print(f"\r{i + 1}/{len(rows)}", end="", file=sys.stderr)

print(f"\n{model}: {ok}/{len(rows)} correct routing ({100 * ok / len(rows):.0f}%), {valid} with valid arguments")
for t, (a, b) in sorted(by_tool.items()):
    print(f"  {t:22} {a}/{b}")
