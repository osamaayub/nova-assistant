"""Fine-tunes a small open model on Nova's team-mode data (QLoRA) and exports it for Ollama.

Run this on a free Google Colab GPU (Runtime > Change runtime type > T4), NOT on this PC:
the laptop GPU has 2 GB, training needs about 10 GB.

Colab cells:
  !pip install unsloth
  # upload training/data/train.jsonl and this file, then:
  !python train.py
It writes a .gguf file and a Modelfile into ./nova-brain-gguf. Download that folder.
"""

import inspect
import json
import sys

from unsloth import FastLanguageModel
from unsloth.chat_templates import train_on_responses_only
from datasets import Dataset
from trl import SFTConfig, SFTTrainer

BASE = "unsloth/Qwen2.5-3B-Instruct"  # small enough to run on a 16 GB PC; supports tool calls
TRAIN_FILE = sys.argv[1] if len(sys.argv) > 1 else "train.jsonl"
MAX_LEN = 3072  # the Nova system prompt alone is about 1,100 tokens

model, tok = FastLanguageModel.from_pretrained(BASE, max_seq_length=MAX_LEN, load_in_4bit=True)
model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    lora_alpha=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    use_gradient_checkpointing="unsloth",
    random_state=7,
)

# Render to text ourselves. Loading the JSON straight into `datasets` would merge the different
# tool-call shapes into one table and leak empty fields into the prompts.
rows = []
with open(TRAIN_FILE, encoding="utf-8") as f:
    for line in f:
        ex = json.loads(line)
        text = tok.apply_chat_template(ex["messages"], tools=ex["tools"], tokenize=False)
        rows.append({"text": text})
print("example 0 as the model sees it:\n", rows[0]["text"][-900:])
dataset = Dataset.from_list(rows)

length_arg = "max_length" if "max_length" in inspect.signature(SFTConfig).parameters else "max_seq_length"
trainer = SFTTrainer(
    model=model,
    tokenizer=tok,
    train_dataset=dataset,
    args=SFTConfig(
        dataset_text_field="text",
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        num_train_epochs=2,
        learning_rate=2e-4,
        warmup_steps=10,
        logging_steps=10,
        optim="adamw_8bit",
        lr_scheduler_type="linear",
        seed=7,
        output_dir="outputs",
        report_to="none",
        **{length_arg: MAX_LEN},
    ),
)
# Learn only from what the assistant wrote (tool calls and replies), not the prompt or tool results.
trainer = train_on_responses_only(
    trainer,
    instruction_part="<|im_start|>user\n",
    response_part="<|im_start|>assistant\n",
)
trainer.train()

model.save_pretrained_gguf("nova-brain-gguf", tok, quantization_method="q4_k_m")
print("Done. Download the nova-brain-gguf folder.")
