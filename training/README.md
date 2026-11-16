# Fine-tune Nova's brain

Teaches a small open model (Qwen3 4B Instruct 2507, Apache 2.0 so it can be sold) to do Nova's main-agent job in team mode: pick the right specialist, write a self-contained task, run independent jobs in parallel, ask when info is missing, refuse what Nova can't do, and reply in one to three spoken sentences.

It runs on a free Google Colab GPU. This PC (GeForce 930MX, 2 GB) cannot train it. The result is a file of about 2.5 GB that runs in Ollama on this PC (16 GB RAM).

## Steps

1. Make the data (no GPU needed, about a second):
   `python training/build_dataset.py`
2. Open [colab.research.google.com](https://colab.research.google.com), start a notebook, set **Runtime > Change runtime type > T4 GPU**.
3. Upload `training/data/train.jsonl` and `training/train.py`.
4. In one cell: `!pip install unsloth`. In the next: `!python train.py`. Expect roughly 40 to 90 minutes (a guess, not measured).
5. Download the `nova-brain-gguf` folder. It has a `.gguf` file and a `Modelfile`.
6. On this PC, in that folder: `ollama create nova-brain -f Modelfile`
7. Score it against the base model (Ollama must be running):
   ```
   ollama pull qwen3:4b-instruct-2507-q4_K_M   # check the exact tag on ollama.com/library/qwen3
   python training/eval_routing.py qwen3:4b-instruct-2507-q4_K_M
   python training/eval_routing.py nova-brain
   ```
8. If `nova-brain` scores clearly higher, set **Settings > Brain > Ollama model** to `nova-brain`.

## Good to know

| Topic | Detail |
|---|---|
| Eval is fair | Eval prompts use phrasings that never appear in training. |
| Data is synthetic | Built from templates and the real tool and prompt text. It teaches format and routing, not new knowledge. Real conversations would make it better. |
| Keep in sync | `build_dataset.py` copies the tool descriptions and system prompt from `src/main/agent`. If those change, update it and retrain. |
| Not tested | The Colab run and Ollama import were not run when this was written. If `ollama create` gives a bad template, copy the `TEMPLATE` block from `ollama show qwen3:4b-instruct-2507-q4_K_M --modelfile` into the Modelfile. |
| Single mode | Only team mode is trained. Single mode (one agent with every tool) is not covered. |
