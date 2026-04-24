#!/usr/bin/env python3
"""Utilities for the PR review proposal flow.

Subcommands:
  build-comment    Build the markdown proposal comment body.
  parse-checkboxes Read a comment body file and emit the checked reviewer IDs as JSON.
  format-names     Convert a JSON reviewer-ID array to a display-name string.

Usage:
  python pr_review_propose.py build-comment --reviewer-count 3 --lines 247 --files 8
  python pr_review_propose.py parse-checkboxes comment.txt
  python pr_review_propose.py format-names '["correctness","security"]'
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from typing import NamedTuple


class Reviewer(NamedTuple):
    id: str
    label: str
    description: str


REVIEWERS: list[Reviewer] = [
    Reviewer(
        "correctness", "Correctness", "logic errors, race conditions, lifecycle issues"
    ),
    Reviewer("security", "Security", "vulnerabilities, secret exposure, injection"),
    Reviewer(
        "api-compatibility",
        "API Compatibility",
        "breaking changes, release tags, type design",
    ),
    Reviewer("performance", "Performance", "algorithmic regressions, memory leaks"),
    Reviewer("testing", "Testing", "coverage gaps, hollow tests"),
]

_LABEL_TO_ID: dict[str, str] = {r.label.lower(): r.id for r in REVIEWERS}
_ID_TO_LABEL: dict[str, str] = {r.id: r.label for r in REVIEWERS}

# The confirm workflow matches the rendered line `- [x] **Start review**` as a
# literal substring — if this label changes, update the `contains()` checks in
# .github/workflows/pr-review-confirm.yml to match.
START_LABEL = "Start review"


def get_selected(reviewer_count: int) -> set[str]:
    """Return the reviewer IDs to pre-check for a proposal.

    Today this is just the first N by priority. Content-aware selection
    (e.g. skipping security on docs-only PRs) can slot in here later.
    """
    priority_ids = [r.id for r in REVIEWERS]
    return set(priority_ids[:reviewer_count])


# ── Subcommand implementations ────────────────────────────────────────────────


def cmd_build_comment(args: argparse.Namespace) -> None:
    """Print the proposal comment markdown to stdout."""
    selected = get_selected(args.reviewer_count)

    lines = [
        "<!-- pr-review-confirm -->",
        "",
        "Hi! Thank you for opening this PR. Want me to review it?",
        "",
        f"Based on the diff ({args.lines} lines, {args.files} files), I've queued these reviewers:",
        "",
    ]
    for r in REVIEWERS:
        check = "x" if r.id in selected else " "
        lines.append(f"- [{check}] **{r.label}** — {r.description}")
    lines += [
        "",
        "Toggle the reviewer checkboxes above to adjust, then tick the box below to start:",
        "",
        f"- [ ] **{START_LABEL}**",
    ]
    print("\n".join(lines))


def cmd_parse_checkboxes(args: argparse.Namespace) -> None:
    """Read a comment body file and print a JSON array of checked reviewer IDs."""
    path = args.body_file
    if path == "-":
        body = sys.stdin.read()
    else:
        with open(path) as f:
            body = f.read()

    checked: list[str] = []
    for m in re.finditer(r"- \[x\] \*\*(.+?)\*\*", body, re.IGNORECASE):
        key = m.group(1).lower()
        rid = _LABEL_TO_ID.get(key)
        if rid and rid not in checked:
            checked.append(rid)
    print(json.dumps(checked))


def cmd_format_names(args: argparse.Namespace) -> None:
    """Print a comma-separated list of reviewer display names."""
    ids: list[str] = json.loads(args.reviewers_json)
    names = [_ID_TO_LABEL.get(r, r) for r in ids]
    print(", ".join(names))


# ── CLI wiring ────────────────────────────────────────────────────────────────


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="PR review confirmation flow utilities"
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("build-comment", help="Build confirmation comment body")
    p.add_argument(
        "--reviewer-count",
        type=int,
        required=True,
        help="Number of reviewers to pre-check (taken from priority list)",
    )
    p.add_argument("--lines", type=int, required=True, help="Lines changed in diff")
    p.add_argument("--files", type=int, required=True, help="Files changed in diff")
    p.set_defaults(func=cmd_build_comment)

    p = sub.add_parser(
        "parse-checkboxes", help="Parse checked reviewers from comment body"
    )
    p.add_argument("body_file", help="Path to comment body file, or - for stdin")
    p.set_defaults(func=cmd_parse_checkboxes)

    p = sub.add_parser("format-names", help="Format reviewer IDs as display names")
    p.add_argument("reviewers_json", help="JSON array of reviewer IDs")
    p.set_defaults(func=cmd_format_names)

    return parser


def main() -> None:
    args = _build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
