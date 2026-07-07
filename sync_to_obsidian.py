#!/usr/bin/env python3
"""
sync_to_obsidian.py — Append Dossier entry data to Obsidian character notes.

Usage:
  python3 sync_to_obsidian.py                     # sync all entries
  python3 sync_to_obsidian.py "Jack-O"             # sync one entry
  python3 sync_to_obsidian.py --dry-run             # preview without writing
  python3 sync_to_obsidian.py --vault ~/other/vault  # override vault path
"""

import json
import sys
from datetime import datetime
from pathlib import Path

DOSSIER_JSON = Path(__file__).parent / "dossier-state.json"
DEFAULT_VAULT = Path.home() / "Obsidian Vault" / "Noir Game Jam" / "Characters"

# Tags that are internal/meta and shouldn't be synced to notes
SKIP_TAGS = {"pronouns"}


def load_dossier(path=DOSSIER_JSON):
    with open(path) as f:
        return json.load(f)


def entry_to_markdown(entry, journal_entries):
    """Convert a Dossier entry + its journal entries to a markdown section."""
    lines = []

    lines.append(f"**Type:** {entry['type']}")
    if entry.get("subtitle"):
        lines.append(f"**Subtitle:** {entry['subtitle']}")
    if entry.get("portrait"):
        lines.append(f"**Portrait:** {entry['portrait']}")

    # Tags
    tags = entry.get("tags", {})
    visible_tags = {k: v for k, v in tags.items() if k not in SKIP_TAGS}
    if visible_tags:
        lines.append("")
        lines.append("### Tags")
        for key, val in visible_tags.items():
            lines.append(f"- **{key}:** {val}")

    # Notes (skip "READ THIS" instructions meant for Claude)
    notes = (entry.get("notes") or "").strip()
    if notes and not notes.upper().startswith("READ THIS"):
        lines.append("")
        lines.append("### Notes")
        lines.append(notes)

    # Journal
    if journal_entries:
        lines.append("")
        lines.append("### Journal")
        for je in journal_entries:
            prompt = je.get("prompt", "")
            text = je.get("text", "")
            ts = je.get("timestamp", "")
            lines.append(f"- **{prompt}**")
            lines.append(f"  {text}")
            if ts:
                lines.append(f"  *({ts})*")

    return "\n".join(lines)


def sync_entry(entry, journal_entries, vault_dir, dry_run=False):
    """Append a sync section to the entry's Obsidian note. Returns True if written."""
    name = entry["name"]
    note_path = vault_dir / f"{name}.md"

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    body = entry_to_markdown(entry, journal_entries)
    section = f"\n\n---\n## Dossier sync from {timestamp}\n\n{body}\n"

    if dry_run:
        print(f"--- {name} → {note_path} ---")
        print(section)
        return False

    if not note_path.exists():
        print(f"  [new] Creating {note_path.name}")
        note_path.write_text(section.lstrip("\n"))
    else:
        print(f"  [append] {note_path.name}")
        with open(note_path, "a") as f:
            f.write(section)

    return True


def main():
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    if dry_run:
        args.remove("--dry-run")

    vault_dir = DEFAULT_VAULT
    if "--vault" in args:
        idx = args.index("--vault")
        vault_dir = Path(args[idx + 1])
        args = args[:idx] + args[idx + 2:]

    filter_name = args[0] if args else None

    if not vault_dir.is_dir():
        print(f"Vault directory not found: {vault_dir}")
        sys.exit(1)

    data = load_dossier()
    entries = data.get("entries", [])
    journal = data.get("journalEntries", {})

    count = 0
    for entry in entries:
        if filter_name and entry["name"] != filter_name:
            continue
        je = journal.get(entry["id"], [])
        if sync_entry(entry, je, vault_dir, dry_run=dry_run):
            count += 1

    if filter_name and count == 0 and not dry_run:
        print(f"No entry named '{filter_name}' found in dossier-state.json")
        sys.exit(1)

    if not dry_run:
        print(f"\nSynced {count} entry/entries.")


if __name__ == "__main__":
    main()
