"""Builds the fine-tuning data for Nova's main agent (team mode).

What it teaches: pick the right specialist, hand over a self-contained task, call tools in
parallel when jobs are independent, ask when info is missing, refuse what Nova cannot do,
and answer in one to three plain spoken sentences.

No dependencies. Run:  python training/build_dataset.py
Writes training/data/train.jsonl and training/data/eval.jsonl.

KEEP IN SYNC: SPECIALISTS, TOOL descriptions and system_prompt() copy src/main/agent/team.ts,
src/main/agent/prompt.ts and src/main/agent/tools/*. If you change those, change them here.
Eval prompts use phrasings that never appear in the training set.
"""

import argparse
import datetime
import json
import random
from pathlib import Path

# --- Copied from the app --------------------------------------------------------------------

APPS = {
    "notepad": "Notepad", "calculator": "Calculator", "paint": "Paint",
    "file explorer": "File Explorer", "task manager": "Task Manager",
    "settings": "Windows Settings", "camera": "Camera", "clock": "Clock",
    "chrome": "Google Chrome", "edge": "Microsoft Edge", "firefox": "Firefox",
    "vs code": "Visual Studio Code", "spotify": "Spotify", "whatsapp": "WhatsApp",
    "word": "Microsoft Word", "excel": "Microsoft Excel",
    "powerpoint": "Microsoft PowerPoint", "outlook": "Outlook",
}

SPECIALISTS = [
    ("ask_pc_agent", "PC agent",
     "opening or closing apps, opening websites, playing music or a video, sending a WhatsApp message, checking how the PC is doing, timers and reminders"),
    ("ask_files_agent", "Files agent",
     "looking in, finding files in, searching inside the user's notes and documents for an answer, creating or opening the user's folders, and tidying Downloads"),
    ("ask_architect_agent", "Architect agent",
     "designing algorithms, architecture or an implementation plan before code is written"),
    ("ask_developer_agent", "Developer agent",
     "writing, editing or refactoring code files in a project folder"),
    ("ask_reviewer_agent", "Reviewer agent",
     "reviewing code for bugs, security issues, edge cases or style before it is trusted"),
    ("ask_tester_agent", "Tester agent",
     "running fixed project checks like tests, typecheck or lint and reporting failures"),
    ("ask_research_agent", "Research agent",
     "questions that need current or exact facts from the web"),
]

CHARACTERS = {
    "Nova": "You are Nova, a calm, capable personal assistant with a light, dry wit, in the spirit of a film-style AI butler. You are warm but efficient, and you never ramble.",
    "Jarvis": "You are Jarvis, a polished, formal British-style AI butler. You are precise, quietly confident and dryly witty, you address the user as \"sir\" or \"ma'am\" only when their name is unknown, and you never ramble.",
    "Sage": "You are Sage, a patient mentor. You help the user think clearly, ask a good question when it helps, and encourage steady progress.",
    "Max": "You are Max, a relaxed, upbeat best friend. Casual and supportive, a bit playful, always honest.",
}


def tool(name, description, props=None, required=None):
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": props or {},
                "required": required or [],
            },
        },
    }


TOOLS = [
    tool(
        t,
        f"Give a task to the {n}. Use it for {w}. Include the user's intent, relevant constraints, and any findings this task depends on; the agent cannot see the conversation.",
        {"task": {"type": "string", "minLength": 3, "maxLength": 800}},
        ["task"],
    )
    for t, n, w in SPECIALISTS
] + [
    tool(
        "remember_fact",
        'Save a short, lasting fact about the user so you remember it in future chats (name, preferences, goals, projects, important dates). Do not save passwords, card numbers, health details or anything the user asks you to keep private. Write it in third person, e.g. "Prefers short answers".',
        {"fact": {"type": "string", "minLength": 3, "maxLength": 300}},
        ["fact"],
    ),
    tool(
        "forget_fact",
        "Delete remembered facts that contain the given words, when the user asks you to forget something.",
        {"about": {"type": "string", "minLength": 3, "maxLength": 100,
                   "description": "Words from the fact to forget"}},
        ["about"],
    ),
    tool("get_datetime", "Get the current local date, time and time zone."),
]


def system_prompt(rng, now, user_name, facts):
    char = rng.choice(list(CHARACTERS))
    team = "\n".join(f"- {t}: the {n}, for {w}." for t, n, w in SPECIALISTS)
    memory = "\n".join(f"- {f}" for f in facts) if facts else "- Nothing yet."
    when = now.strftime("%A, %B %d, %Y at %I:%M %p").replace(" 0", " ")
    name_line = f"The user's name is {user_name}." if user_name else "You don't know the user's name yet."
    return f"""{CHARACTERS[char]}

You run as a desktop assistant on the user's Windows PC. Your replies are often read aloud, so:
- Keep answers short: one to three sentences unless the user asks for detail.
- Use plain sentences. No markdown, no bullet symbols, no emojis, no URLs read out loud.
- When you do something, say what you did in a few words.
- Keep the chosen character consistent without reintroducing yourself. Talk naturally, respond to the user's tone, and use remembered details only when they genuinely help.
- Be warm and attentive without pretending to have human feelings, personal experiences, or abilities you do not have. Avoid canned greetings, excessive jokes, and unnecessary follow-up questions.
For any task, run a Plan, Act, Observe, Verify loop: plan the smallest useful steps, act with the right tool or specialist, observe the result, and verify success from evidence before you report it. If you cannot verify something, say exactly what is unverified. Keep continuity so the user does not repeat themselves, and use specialists like temporary experts for one job at a time.

You lead a small team of specialist agents. Hand each job to the right one with its tool:
{team}
Coordinate the work: split requests into clear tasks, choose the specialist whose role and tools fit each task, and handle independent parts yourself when practical. For dependent tasks, wait for the first report and include the relevant result in the next specialist's task. Each specialist sees only the task you send, not this chat, so include the user's intent, needed constraints, and any relevant findings.
For complex coding, run the coding crew in order: Architect for the plan, Developer for changes, Reviewer for issues, Tester for checks. Pass each report forward so the next agent has the context it needs.
When jobs do not depend on each other, send them to their specialists in the same reply so they work at the same time. When a job needs another's result, wait for that report first. Read each report before deciding the next step. Do not repeat completed work unless a follow-up is needed. If a specialist reports a failure or uncertainty, resolve it with a focused follow-up or tell the user what remains unresolved. Only report actions as successful when the specialist confirms they worked.
Answer simple chat, opinions and general knowledge yourself without a specialist. Handle memory yourself with remember_fact and forget_fact.
Only you speak to the user. Combine useful reports into one concise answer and do not expose internal handoffs.
Apps the PC agent can open: {", ".join(APPS)}.
If the user asks for something you can't do, say so plainly and suggest what they can do instead.
Never claim you did something unless a tool or specialist result says it worked.
You can look things up on the web: for current events and exact facts, search first instead of guessing, and mention where the answer came from in a few words.

Memory: when the user shares something lasting about themselves (their name, preferences, goals, projects, corrections to things you believed), save it with remember_fact — and when a fact changes, forget the old one first. Don't save private or sensitive details. If they ask you to forget something, use forget_fact.

{name_line}
Current local time: {when}.

What you remember about the user:
{memory}"""


# --- Slot pools -----------------------------------------------------------------------------

SONGS = ["lofi beats", "Coldplay Yellow", "some jazz", "Arijit Singh", "Imagine Dragons Believer",
         "relaxing piano", "Atif Aslam", "a workout mix", "Taylor Swift", "study music"]
SITES = [("YouTube", "youtube.com"), ("GitHub", "github.com"), ("Wikipedia", "wikipedia.org"),
         ("Gmail", "mail.google.com"), ("Google Maps", "maps.google.com"),
         ("Reddit", "reddit.com"), ("LinkedIn", "linkedin.com")]
FOLDERS = ["desktop", "documents", "downloads", "pictures", "music", "videos"]
FILES = ["invoice", "resume", "tax return", "passport scan", "project report", "lecture notes",
         "wedding photos", "budget"]
CITIES = ["Lahore", "Karachi", "London", "New York", "Dubai", "Istanbul", "Toronto"]
DOC_TOPICS = ["the Lahore trip", "my budget", "the project deadline", "my meeting notes", "my workout plan", "the wifi setup"]
TOPICS = ["electric cars", "the cricket series", "the stock market", "space missions", "AI regulation"]
REMINDERS = ["take the pizza out", "call mum", "stand up and stretch", "check the oven",
             "submit the assignment", "drink water"]
PEOPLE = ["Ali", "Sara", "Hamza", "Ayesha", "Bilal"]
NAMES = ["Osama", "Maria", "Daniel", "Fatima", "Chen", "Ravi", ""]
FACT_POOL = ["Prefers short answers", "Is learning agentic engineering", "Likes lofi music",
             "Works on a project called Nova", "Studies computer science", "Prefers dark mode"]
PROJECTS = ["nova-assistant", "todo-app", "portfolio-site", "weather-bot", "blog-engine",
            "budget-tracker", "chat-app", "game-engine"]
CODE_JOBS = [
    ("ask_architect_agent", ["Plan how to add {feat} to my {p} project", "Design how {feat} should work in {p}"],
     "Design {feat} for the {p} project in the user's Documents folder. Read the existing code first and report a plan with files, steps and risks.",
     "Plan ready: 3 files to change, 5 steps, main risk is state handling.",
     "The architect has a plan: three files to change in five steps. Want me to start on it?"),
    ("ask_developer_agent", ["Add {feat} to my {p} project", "Write the code for {feat} in {p}"],
     "Implement {feat} in the {p} project in the user's Documents folder. Read the files first, keep changes focused, and report which files changed.",
     "Changed 2 files after the user approved: src/app.ts and src/{p}.css.",
     "Done. The developer changed two files."),
    ("ask_reviewer_agent", ["Review the code in {p} for bugs", "Check {p} for security problems"],
     "Review the code in the {p} project in the user's Documents folder for bugs and security issues. Read only. Report findings ordered by severity.",
     "1 high issue: unchecked user input in src/api.ts. 2 minor style notes.",
     "The reviewer found one high-severity issue: unchecked user input in the API file, plus two minor style notes."),
    ("ask_tester_agent", ["Run the tests for {p}", "Does {p} pass its checks?"],
     "Run the project tests for {p} in the user's Documents folder and report pass or fail with error details.",
     "All 42 tests passed.",
     "All 42 tests passed."),
]
FEATS = ["dark mode", "a settings page", "a search box", "user login"]

# Last phrasing in each list is held out for eval only.
PHRASES = {
    "open_app": ["Open {a}", "Can you launch {a} for me?", "Start {a}", "Please open up {a}", "I need {a} right now"],
    "close_app": ["Close {a}", "Shut down {a}", "Quit {a} please", "I'm done with {a}, close it"],
    "music_yt": ["Play {s}", "Put on {s}", "Play {s} on YouTube", "I feel like hearing {s}"],
    "music_sp": ["Play {s} on Spotify", "Open {s} in Spotify", "Find {s} on Spotify for me"],
    "site": ["Open {w}", "Take me to {w}", "Go to {w}", "Pull up {w} in the browser"],
    "timer": ["Set a timer for {n} minutes", "Remind me in {n} minutes to {r}", "Timer for {n} minutes please", "Give me a nudge in {n} minutes to {r}"],
    "status": ["How is my PC doing?", "Is my computer running slow?", "Check my PC health", "Why does my laptop feel sluggish?"],
    "list": ["What's in my {f} folder?", "Show me what's in {f}", "List my {f}", "Anything new in my {f}?"],
    "find": ["Find my {q} file", "Where is my {q}?", "Search my files for {q}", "I can't locate my {q}"],
    "tidy": ["Tidy my Downloads", "Clean up my Downloads folder", "Organize my downloads", "My downloads are a mess, sort them"],
    "mkdir": ["Make a folder called {n} on my Desktop", "Create a {n} folder in Documents", "New folder named {n} in my documents please"],
    "docsearch": ["What did I write about {d}?", "Find my notes on {d}", "Check my documents for {d}", "Do I have anything saved about {d}?"],
    "weather": ["What's the weather in {c}?", "Is it going to rain in {c}?", "How hot is it in {c} today?", "Should I take a jacket in {c}?"],
    "news": ["What's the latest on {t}?", "Any news about {t}?", "Look up {t} for me", "Catch me up on {t}"],
    "remember": ["Remember that {u}", "Keep in mind that {u}", "Don't forget that {u}", "For next time: {u}"],
    "forget": ["Forget that {u}", "Please forget that {u}", "Delete the note that {u}", "Stop remembering that {u}"],
    "time": ["What time is it?", "What's the time?", "What's today's date?", "Tell me the time"],
}

REMEMBER = [("I prefer short answers", "Prefers short answers", "prefer short answers"),
            ("I'm learning {t}", "Is learning {t}", "like learning {t}"),
            ("I like {s}", "Likes {s}", "like {s}"),
            ("my sister is called {p}", "Has a sister called {p}", "my sister is called {p}"),
            ("I work best in the morning", "Works best in the morning", "work best in the morning")]
LEARN = ["Python", "guitar", "Spanish", "machine learning"]

CHAT = [
    ("Hello", "Hi, how can I help?"),
    ("How are you?", "Doing well, thanks. What do you need?"),
    ("What's 12 times 12?", "144."),
    ("Tell me a joke", "I tried to write a joke about UDP, but you might not get it."),
    ("Thanks Nova", "Anytime."),
    ("Who are you?", "I'm your desktop assistant. I can open apps, find files, set timers and look things up."),
    ("What can you do?", "I can open and close apps, play music, set timers, tidy your files, look things up online, and remember things about you."),
    ("Is Python good for beginners?", "Yes. Its syntax is readable and there are plenty of free tutorials."),
    ("Give me a tip for focusing", "Work in twenty five minute blocks with short breaks, and keep your phone out of reach."),
    ("What is the capital of France?", "Paris."),
    ("Good morning", "Good morning. Ready when you are."),
    ("Say something encouraging", "You're making steady progress, and that's what counts."),
    ("What's the difference between RAM and storage?", "RAM is short-term memory for running programs. Storage keeps your files when the PC is off."),
    ("Spell necessary", "N, E, C, E, S, S, A, R, Y."),
    ("Are you a person?", "No, I'm an AI assistant running on your PC."),
]
CHAT_EVAL = CHAT[-3:]
CHAT_TRAIN = CHAT[:-3]

CANNOT = [
    ("Delete everything in my Downloads", "I never delete files. I can open the folder or tidy it into subfolders if you like."),
    ("Wipe my Documents folder", "I never delete anything. I can open Documents so you can decide what to remove."),
    ("Buy me a new laptop", "I can't buy things. I can open a shopping site for you."),
    ("Email my boss that I'm sick", "I can't send email without a connected mail app. I can open Outlook for you."),
    ("Hack my neighbour's wifi", "I can't help with that."),
    ("Run this command in PowerShell: format c:", "I don't run commands. I can only use my fixed tools."),
    ("Transfer money to my friend", "I can't move money. I can open your bank's website."),
    ("Post this on my Instagram", "I can't post for you. I can open Instagram so you can do it."),
]
CANNOT_EVAL = CANNOT[-2:]
CANNOT_TRAIN = CANNOT[:-2]


# --- Example builders -----------------------------------------------------------------------

def pick(rng, key, held):
    ph = PHRASES[key]
    return rng.choice(ph[-1:] if held else ph[:-1])


def single(rng, kind, held):
    """One intent -> dict(user, calls=[(tool, args, report)], reply). Returns None to skip."""
    if kind == "open_app":
        a = rng.choice(list(APPS)); lab = APPS[a]
        return dict(user=pick(rng, kind, held).format(a=a),
                    calls=[("ask_pc_agent", {"task": f"Open {lab} on the PC."}, f"Opened {lab}.")],
                    reply=rng.choice([f"{lab} is open.", f"Opened {lab}.", f"Done, {lab} is up."]))
    if kind == "close_app":
        a = rng.choice(list(APPS)); lab = APPS[a]
        return dict(user=pick(rng, kind, held).format(a=a),
                    calls=[("ask_pc_agent", {"task": f"Close {lab}."}, f"Closed {lab}.")],
                    reply=rng.choice([f"{lab} is closed.", f"Closed {lab}."]))
    if kind == "music_yt":
        s = rng.choice(SONGS)
        return dict(user=pick(rng, kind, held).format(s=s),
                    calls=[("ask_pc_agent", {"task": f"Play {s} on YouTube."}, f"Playing {s} on YouTube.")],
                    reply=f"Playing {s} now.")
    if kind == "music_sp":
        s = rng.choice(SONGS)
        return dict(user=pick(rng, kind, held).format(s=s),
                    calls=[("ask_pc_agent", {"task": f"Search for {s} in Spotify. The user will need to press play themselves."},
                            f"Opened the Spotify search for {s}. The user has to press play.")],
                    reply=f"I opened {s} in Spotify. You just need to press play.")
    if kind == "site":
        w, url = rng.choice(SITES)
        return dict(user=pick(rng, kind, held).format(w=w),
                    calls=[("ask_pc_agent", {"task": f"Open the website {url} in the browser."}, f"Opened {url}.")],
                    reply=f"Opened {w}.")
    if kind == "timer":
        n = rng.choice([1, 2, 5, 10, 15, 20, 30, 45, 60]); r = rng.choice(REMINDERS)
        template = pick(rng, kind, held)
        text = template.format(n=n, r=r)
        label = r if "{r}" in template else "Timer"
        return dict(user=text,
                    calls=[("ask_pc_agent", {"task": f"Set a {n} minute timer labelled '{label}'."},
                            f"Timer set for {n} minutes: {label}.")],
                    reply=f"Okay, I'll remind you in {n} minutes.")
    if kind == "status":
        cpu, mem = rng.randint(5, 95), rng.randint(30, 95)
        verdict = "Things look fine." if cpu < 70 and mem < 85 else "It's under some load."
        return dict(user=pick(rng, kind, held),
                    calls=[("ask_pc_agent", {"task": "Check the PC status: CPU, memory, disk and battery, and report the numbers."},
                            f"CPU {cpu}%, memory {mem}% used of 8 GB, disk 71% full, battery 82% and charging.")],
                    reply=f"{verdict} CPU is at {cpu} percent and memory at {mem} percent.")
    if kind == "list":
        f = rng.choice(FOLDERS); n = rng.randint(3, 60); x, y = rng.sample(FILES, 2)
        return dict(user=pick(rng, kind, held).format(f=f),
                    calls=[("ask_files_agent", {"task": f"List what is in the {f} folder."},
                            f"The {f} folder has {n} items, including {x} and {y}.")],
                    reply=f"Your {f} folder has {n} items, including {x} and {y}.")
    if kind == "find":
        q = rng.choice(FILES); f = rng.choice(["documents", "downloads", "desktop"])
        return dict(user=pick(rng, kind, held).format(q=q),
                    calls=[("ask_files_agent", {"task": f"Find files with '{q}' in the name in all of the user's folders."},
                            f"Found 2 matches: {f}/{q}.pdf and {f}/{q} old.docx.")],
                    reply=f"I found two matches, both in {f}: {q} dot pdf and {q} old.")
    if kind == "tidy":
        n = rng.randint(8, 80); k = rng.randint(3, 7)
        if rng.random() < 0.8:
            rep, rp = f"Moved {n} files into {k} folders after the user approved the plan.", f"Done. I sorted {n} files into {k} folders."
        else:
            rep, rp = "The user declined, so nothing was moved.", "No problem, I left Downloads as it is."
        return dict(user=pick(rng, kind, held),
                    calls=[("ask_files_agent", {"task": "Organize the Downloads folder into subfolders by file type. The user must approve the plan first. Never delete anything."}, rep)],
                    reply=rp)
    if kind == "mkdir":
        n = rng.choice(["Projects", "Taxes 2026", "Trip Photos", "Study", "Invoices"])
        where = "documents" if "ocument" in (pick(rng, kind, held)) else "desktop"
        text = pick(rng, kind, held).format(n=n)
        where = "documents" if "ocument" in text else "desktop"
        return dict(user=text,
                    calls=[("ask_files_agent", {"task": f"Create a folder named '{n}' in the user's {where} folder."}, f"Created {where}/{n}.")],
                    reply=f"Created the {n} folder in {where}.")
    if kind == "docsearch":
        d = rng.choice(DOC_TOPICS); f = rng.choice(["Documents/notes/plan.md", "Documents/journal.txt", "Desktop/todo.md"])
        return dict(user=pick(rng, kind, held).format(d=d),
                    calls=[("ask_files_agent", {"task": f"Search the user's notes and documents for passages about {d}. Report what they say and which file each came from."},
                            f"Found 2 passages about {d} in {f}: the main point is noted there.")],
                    reply=f"Your notes in {f} cover {d}.")
    if kind == "weather":
        c = rng.choice(CITIES); t = rng.randint(2, 38)
        sky = rng.choice(["sunny", "cloudy", "light rain", "clear"])
        return dict(user=pick(rng, kind, held).format(c=c),
                    calls=[("ask_research_agent", {"task": f"Find the current weather in {c} (temperature in Celsius and conditions). End with your sources."},
                            f"{c}: {t} C and {sky}. Source: a weather forecast site.")],
                    reply=f"It's {t} degrees and {sky} in {c}, according to a weather site.")
    if kind == "news":
        t = rng.choice(TOPICS)
        return dict(user=pick(rng, kind, held).format(t=t),
                    calls=[("ask_research_agent", {"task": f"Find the latest news about {t} and summarise the main point in one or two sentences. End with your sources."},
                            f"Recent coverage of {t} from BBC and Reuters says developments continue this week.")],
                    reply=f"The latest from BBC and Reuters says developments on {t} continue this week.")
    if kind == "remember":
        u, fact, said = rng.choice(REMEMBER)
        sub = dict(t=rng.choice(LEARN), s=rng.choice(SONGS), p=rng.choice(PEOPLE))
        return dict(user=pick(rng, kind, held).format(u=u.format(**sub)),
                    calls=[("remember_fact", {"fact": fact.format(**sub)}, f"Remembered: {fact.format(**sub)}")],
                    reply=rng.choice(["Got it, I'll remember that.", "Noted.", "Okay, saved."]))
    if kind == "forget":
        u, fact, said = rng.choice(REMEMBER[1:3])
        sub = dict(t=rng.choice(LEARN), s=rng.choice(SONGS))
        about = said.format(**sub).replace("like ", "").replace("learning ", "")
        return dict(user=pick(rng, kind, held).format(u=u.format(**sub)),
                    calls=[("forget_fact", {"about": about}, f"Forgot 1: {fact.format(**sub)}")],
                    reply=rng.choice(["Done, I've forgotten that.", "Okay, that's gone from memory."]))
    if kind == "time":
        return dict(user=pick(rng, kind, held), calls=[("get_datetime", {}, "@NOW")], reply="@NOW_REPLY")
    return None


def crew(rng, held):
    tool_name, phrases, task, report, reply = rng.choice(CODE_JOBS)
    p, feat = rng.choice(PROJECTS), rng.choice(FEATS)
    user = (phrases[-1] if held else phrases[0]).format(p=p, feat=feat)
    return dict(user=user, calls=[(tool_name, {"task": task.format(p=p, feat=feat)}, report.format(p=p))], reply=reply)


def whatsapp(rng, held):
    person, num = rng.choice(PEOPLE), "+92 300 " + str(rng.randint(1000000, 9999999))
    msg = rng.choice(["I'm running late", "Happy birthday", "Call me when you can", "See you at 6"])
    if rng.random() < 0.5:  # missing number -> ask, no tool
        return dict(user=f"Send a WhatsApp to {person} saying {msg}", calls=[],
                    reply=f"What's {person}'s phone number, with the country code?")
    user = f"Send a WhatsApp to {person} at {num} saying {msg}"
    if held:
        user = f"WhatsApp {person} ({num}): {msg}"
    sent = rng.random() < 0.7
    rep = "Sent." if sent else "The chat is open with the message typed, but it was not sent. The user must press Send."
    return dict(user=user,
                calls=[("ask_pc_agent", {"task": f"Send a WhatsApp message to {num} with the text: {msg}"}, rep)],
                reply=f"Sent your message to {person}." if sent else f"The chat with {person} is open and ready, you just need to press Send.")


MULTI_KINDS = ["open_app", "music_yt", "site", "timer", "status", "tidy", "list", "weather", "find"]


def multi(rng, held):
    a, b = rng.sample(MULTI_KINDS, 2)
    x, y = single(rng, a, False), single(rng, b, False)
    if x["calls"][0][0] == y["calls"][0][0] == "ask_pc_agent" and a == b:
        return None
    lead = rng.choice(["{x} and {y}", "{x}, then {y}", "Two things: {x}, and {y}"])
    if held:
        lead = "Can you {x}? Also {y}"
    low = lambda s: s[0].lower() + s[1:]
    user = lead.format(x=low(x["user"].rstrip("?.")), y=low(y["user"].rstrip("?.")))
    user = user[0].upper() + user[1:]
    return dict(user=user, calls=x["calls"] + y["calls"], reply=f"{x['reply']} {y['reply']}")


def render(rng, ex, split):
    now = datetime.datetime(2026, 11, 16, rng.randint(6, 23), rng.randint(0, 59))
    facts = rng.sample(FACT_POOL, rng.randint(0, 3))
    sysmsg = system_prompt(rng, now, rng.choice(NAMES), facts)
    clock = now.strftime("%I:%M %p").lstrip("0")
    day = now.strftime("%A, %B %d, %Y").replace(" 0", " ")
    msgs = [{"role": "system", "content": sysmsg}, {"role": "user", "content": ex["user"]}]
    if ex["calls"]:
        msgs.append({"role": "assistant", "content": "", "tool_calls": [
            {"type": "function", "function": {"name": n, "arguments": a}} for n, a, _ in ex["calls"]]})
        for n, _, rep in ex["calls"]:
            rep = f"{day}, {clock}, Pakistan Standard Time." if rep == "@NOW" else rep
            msgs.append({"role": "tool", "name": n, "content": rep})
    reply = f"It's {clock}, {day}." if ex["reply"] == "@NOW_REPLY" else ex["reply"]
    msgs.append({"role": "assistant", "content": reply})
    return {"split": split, "expected_tools": [n for n, _, _ in ex["calls"]],
            "messages": msgs, "tools": TOOLS}


SINGLE_KINDS = ["open_app", "close_app", "music_yt", "music_sp", "site", "timer", "status", "list",
                "find", "docsearch", "tidy", "mkdir", "weather", "news", "remember", "forget", "time"]


def generate(rng, n, held, max_dup):
    """max_dup: how many times the same request may repeat. Each copy gets a different system
    prompt (character, time, memory), so repeats still teach something. Needed so short chat
    and refusals, which have few unique prompts, are not drowned out by tool calls."""
    out, seen = [], {}
    while len(out) < n:
        r = rng.random()
        if r < 0.50:
            ex = single(rng, rng.choice(SINGLE_KINDS), held)
        elif r < 0.62:
            ex = multi(rng, held)
        elif r < 0.70:
            ex = crew(rng, held)
        elif r < 0.76:
            ex = whatsapp(rng, held)
        elif r < 0.90:
            u, rp = rng.choice(CHAT_EVAL if held else CHAT_TRAIN)
            ex = dict(user=u, calls=[], reply=rp)
        else:
            u, rp = rng.choice(CANNOT_EVAL if held else CANNOT_TRAIN)
            ex = dict(user=u, calls=[], reply=rp)
        if not ex:
            continue
        key = (ex["user"], json.dumps(ex["calls"], sort_keys=True))
        if seen.get(key, 0) >= (max_dup if ex["calls"] else max_dup * 3):
            continue
        seen[key] = seen.get(key, 0) + 1
        out.append(ex)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", type=int, default=1200)
    ap.add_argument("--eval", type=int, default=150)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default=str(Path(__file__).parent / "data"))
    args = ap.parse_args()
    rng = random.Random(args.seed)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    train = generate(rng, args.train, held=False, max_dup=4)
    ev = generate(rng, args.eval, held=True, max_dup=2)
    train_users = {e["user"] for e in train}
    ev = [e for e in ev if e["user"] not in train_users]
    for name, rows, split in (("train", train, "train"), ("eval", ev, "eval")):
        with open(out / f"{name}.jsonl", "w", encoding="utf-8") as f:
            for ex in rows:
                f.write(json.dumps(render(rng, ex, split), ensure_ascii=False) + "\n")
    print(f"train: {len(train)} examples, eval: {len(ev)} examples -> {out}")


if __name__ == "__main__":
    main()
