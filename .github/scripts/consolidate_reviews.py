#!/usr/bin/env python3
"""Consolidate review fleet findings into a single PR report.

Reads review-*.json files from a directory, extracts findings in the format
{"findings": [{"severity": "...", "location": "...", "description": "...", "fix": "..."}]},
de-duplicates by location,
and outputs a consolidated markdown report.

Usage:
    python consolidate_reviews.py <reviews-dir> <run-url> [-o report.md]

Exit codes:
    0 — report generated (findings found)
    1 — unexpected error (bad arguments, unreadable files, etc.)
    2 — no findings across all reviewers (clean run)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict

from pr_review_propose import REVIEWERS as _REVIEWER_DEFS

MARKER = "<!-- pr-review-fleet -->"
EMOJI_KEY = "emoji"
TITLE_KEY = "title"


class SeverityLevelLabel(TypedDict):
    emoji: str
    title: str


SeverityLabelSet = dict[str, SeverityLevelLabel]

REVIEWERS: dict[str, str] = {r.id: r.label for r in _REVIEWER_DEFS}

# Severity ordering (highest first) and display config
SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM"]

SEVERITY_LABEL_SETS: list[SeverityLabelSet] = [
    {
        "CRITICAL": {EMOJI_KEY: "🌶️", TITLE_KEY: "Spicy"},
        "HIGH": {EMOJI_KEY: "🧄", TITLE_KEY: "Pungent"},
        "MEDIUM": {EMOJI_KEY: "🧅", TITLE_KEY: "Smelly"},
    },
    {
        "CRITICAL": {EMOJI_KEY: "🦖", TITLE_KEY: "Disastrous"},
        "HIGH": {EMOJI_KEY: "🐊", TITLE_KEY: "Dangerous"},
        "MEDIUM": {EMOJI_KEY: "🐍", TITLE_KEY: "Disagreeable"},
    },
    {
        "CRITICAL": {EMOJI_KEY: "🪳", TITLE_KEY: "Exterminate"},
        "HIGH": {EMOJI_KEY: "🦟", TITLE_KEY: "Squash"},
        "MEDIUM": {EMOJI_KEY: "🐜", TITLE_KEY: "Investigate"},
    },
    {
        "CRITICAL": {EMOJI_KEY: "🚨", TITLE_KEY: "Alert"},
        "HIGH": {EMOJI_KEY: "🛑", TITLE_KEY: "Stop"},
        "MEDIUM": {EMOJI_KEY: "🚧", TITLE_KEY: "Caution"},
    },
]

VALID_SEVERITIES = frozenset({"CRITICAL", "HIGH", "MEDIUM"})


@dataclass
class Finding:
    severity: str
    location: str
    description: str
    fix: str
    area: str


def parse_review_file(path: Path, area: str) -> list[Finding] | None:
    """Parse a single review file and extract findings from its JSON content.

    Returns None when the file is not valid JSON or has an unexpected shape,
    so callers can distinguish a broken reviewer from a clean empty run.
    """
    text = path.read_text(encoding="utf-8")

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        print(f"Warning: {path.name}: invalid JSON ({exc}), skipping")
        return None

    if not isinstance(data, dict):
        print(
            f"Warning: {path.name}: expected a JSON object, got {type(data).__name__}, skipping"
        )
        return None

    findings: list[Finding] = []
    for item in data.get("findings") or []:
        if not isinstance(item, dict):
            continue
        severity = item.get("severity", "")
        if severity not in VALID_SEVERITIES:
            continue
        location = item.get("location", "")
        description = item.get("description", "")
        fix = item.get("fix", "")
        if not location or not description or not fix:
            continue
        findings.append(
            Finding(
                severity=severity,
                location=location,
                description=description,
                fix=fix,
                area=area,
            )
        )
    return findings


def _sanitize_cell(text: str) -> str:
    """Normalize text for a markdown table cell: collapse newlines, escape pipes."""
    return (
        text.replace("\r\n", " ")
        .replace("\r", " ")
        .replace("\n", " ")
        .replace("|", "\\|")
    )


def deduplicate(findings: list[Finding]) -> list[Finding]:
    """De-duplicate findings by location, keeping highest severity first.

    Findings are pre-sorted by severity (CRITICAL > HIGH > MEDIUM).
    Findings without a file:line location are never de-duplicated.
    """
    seen: set[str] = set()
    result: list[Finding] = []

    for f in findings:
        # Findings without a recognizable file:line are always kept
        has_location = re.match(r".+:\d+", f.location)
        if has_location:
            if f.location in seen:
                continue
            seen.add(f.location)
        result.append(f)

    return result


PROMOTED_AREAS = {"Correctness", "API Compatibility"}


def determine_verdict(findings: list[Finding]) -> tuple[str, str]:
    """Return (verdict_text, verdict_emoji).

    Verdict rules (aligned with local /review skill):
    - Request Changes: 1+ CRITICAL, or 1+ HIGH in Correctness/API Compatibility,
      or 3+ HIGH across other areas
    - Approve with Suggestions: some HIGH/MEDIUM but none in promoted areas
    - Approve: 0 CRITICAL, 0 HIGH
    """
    critical = sum(1 for f in findings if f.severity == "CRITICAL")
    high_promoted = sum(
        1 for f in findings if f.severity == "HIGH" and f.area in PROMOTED_AREAS
    )
    high_other = sum(
        1 for f in findings if f.severity == "HIGH" and f.area not in PROMOTED_AREAS
    )
    high_total = high_promoted + high_other

    if critical > 0 or high_promoted > 0 or high_other >= 3:
        return "Request Changes", "❌"
    if high_total > 0 or any(f.severity == "MEDIUM" for f in findings):
        return "Approve with Suggestions", "⚠️"
    return "Approve", "✔️"


def severity_labels_for_pr(
    pr_number: int | None, commit_count: int | None = None
) -> SeverityLabelSet:
    """Pick a deterministic severity label set using the PR number and commit count.

    Including commit_count means each push to the PR selects a fresh emoji set,
    making it easy to tell review rounds apart at a glance.
    """
    if pr_number is None:
        return SEVERITY_LABEL_SETS[0]
    hash_input = (
        f"{pr_number}:{commit_count}" if commit_count is not None else str(pr_number)
    )
    hash_byte = hashlib.sha256(hash_input.encode("utf-8")).digest()[0]
    return SEVERITY_LABEL_SETS[hash_byte % len(SEVERITY_LABEL_SETS)]


def build_report(
    findings: list[Finding],
    run_url: str,
    pr_number: int | None = None,
    commit_count: int | None = None,
) -> str:
    """Build the consolidated markdown report."""
    # Count by severity
    counts = {s: 0 for s in SEVERITY_ORDER}
    for f in findings:
        counts[f.severity] += 1

    verdict_text, verdict_emoji = determine_verdict(findings)
    severity_labels = severity_labels_for_pr(pr_number, commit_count)

    # Build findings table rows with per-severity numbering
    severity_counters = {s: 0 for s in SEVERITY_ORDER}
    rows: list[str] = []
    for f in findings:
        severity_counters[f.severity] += 1
        prefix = f.severity[0]  # C, H, or M
        label = f"{prefix}{severity_counters[f.severity]}"
        level = severity_labels[f.severity]
        sev_display = f"{level[EMOJI_KEY]} {level[TITLE_KEY]}"
        rows.append(
            f"| {sev_display} | {label} | {f.area} | `{f.location}` | {_sanitize_cell(f.description)} | {_sanitize_cell(f.fix)} |"
        )

    table = "\n".join(rows)
    summary = ", ".join(
        f"{counts[severity]} {severity_labels[severity][TITLE_KEY]}"
        for severity in SEVERITY_ORDER
    )

    return f"""{MARKER}
## :telescope: PR Review Fleet Report

> [!NOTE]
> This report is generated by an experimental AI review fleet and is provided as a **beta feature**. Findings are a starting point for discussion, not a gate. Use your own judgement.

**Verdict:** {verdict_emoji} {verdict_text}

{summary}

### Findings

| Sev | # | Area | File | What | Fix |
|-----|---|------|------|------|-----|
{table}

---
*[View workflow run]({run_url})*
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "reviews_dir", type=Path, help="Directory containing review-*.md files"
    )
    parser.add_argument("run_url", help="URL to the workflow run")
    parser.add_argument(
        "-o", "--output", type=Path, default=Path("report.md"), help="Output file path"
    )
    parser.add_argument(
        "--pr-number",
        type=int,
        help="Pull request number for deterministic emoji set selection",
    )
    parser.add_argument(
        "--commit-count",
        type=int,
        help="Number of commits on the PR; combined with --pr-number to vary emoji set per push",
    )
    parser.add_argument(
        "--reviewers",
        help="JSON array of reviewer IDs that were run. Used to detect silent crashes. If not provided, assumes all reviewers.",
    )
    args = parser.parse_args(argv)

    # Determine which reviewers were expected
    expected_reviewers = REVIEWERS.keys()
    if args.reviewers:
        try:
            parsed = json.loads(args.reviewers)
        except json.JSONDecodeError:
            print("Warning: --reviewers must be a valid JSON array, ignoring", file=sys.stderr)
        else:
            if isinstance(parsed, list):
                expected_reviewers = parsed
            else:
                print("Warning: --reviewers must be a JSON array, ignoring", file=sys.stderr)

    # Collect findings from all reviewer files
    all_findings: list[Finding] = []
    skipped_count = 0
    for reviewer_key in expected_reviewers:
        area_name = REVIEWERS.get(reviewer_key, reviewer_key.title())
        path = args.reviews_dir / f"review-{reviewer_key}.json"
        if not path.exists():
            print(f"{reviewer_key}: no output file (crashed or skipped)")
            skipped_count += 1
            continue

        findings = parse_review_file(path, area_name)
        if findings is None:
            print(f"{reviewer_key}: skipped (invalid output)")
            skipped_count += 1
        elif not findings:
            print(f"{reviewer_key}: no issues found")
        else:
            print(f"{reviewer_key}: {len(findings)} finding(s)")
            all_findings.extend(findings)

    # Sort by severity order, then de-duplicate
    severity_rank = {s: i for i, s in enumerate(SEVERITY_ORDER)}
    all_findings.sort(key=lambda f: severity_rank.get(f.severity, 99))
    all_findings = deduplicate(all_findings)

    if not all_findings:
        if skipped_count > 0:
            print(
                f"{skipped_count} reviewer(s) produced invalid output — cannot confirm clean run."
            )
            return 1
        print("All reviewers passed with no findings.")
        return 2

    report = build_report(all_findings, args.run_url, args.pr_number, args.commit_count)
    args.output.write_text(report, encoding="utf-8")
    print(f"Report written to {args.output} ({len(all_findings)} findings)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
