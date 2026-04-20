#!/usr/bin/env python3
"""Consolidate review fleet findings into a single PR report.

Reads review-*.md files from a directory, extracts findings in the format
[SEVERITY] file:line — description — fix, de-duplicates by file:line,
and outputs a consolidated markdown report.

Usage:
    python consolidate_reviews.py <reviews-dir> <run-url> [-o report.md]

Exit codes:
    0 — report generated (findings found)
    2 — no findings across all reviewers (clean run)
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict

MARKER = "<!-- pr-review-fleet -->"
EMOJI_KEY = "emoji"
TITLE_KEY = "title"

class SeverityLevelLabel(TypedDict):
    emoji: str
    title: str


SeverityLabelSet = dict[str, SeverityLevelLabel]

REVIEWERS = {
    "correctness": "Correctness",
    "security": "Security",
    "api-compatibility": "API Compat",
    "performance": "Performance",
    "testing": "Testing",
}

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

# Pattern: [SEVERITY] file:line — description — fix
FINDING_RE = re.compile(
    r"^\[(CRITICAL|HIGH|MEDIUM)\]\s+"  # severity
    r"(\S+)"  # file:line (or just file)
    r"\s+—\s+"  # separator
    r"(.+?)"  # description (non-greedy)
    r"\s+—\s+"  # separator
    r"(.+)$"  # fix
)


@dataclass
class Finding:
    severity: str
    location: str
    description: str
    fix: str
    area: str


def parse_review_file(path: Path, area: str) -> list[Finding]:
    """Parse a single review file and extract findings."""
    text = path.read_text(encoding="utf-8")

    if "NO_ISSUES_FOUND" in text:
        return []

    findings: list[Finding] = []
    for line in text.splitlines():
        m = FINDING_RE.match(line.strip())
        if m:
            findings.append(
                Finding(
                    severity=m.group(1),
                    location=m.group(2),
                    description=m.group(3),
                    fix=m.group(4)[:200],
                    area=area,
                )
            )
    return findings


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


PROMOTED_AREAS = {"Correctness", "API Compat"}


def determine_verdict(findings: list[Finding]) -> tuple[str, str]:
    """Return (verdict_text, verdict_emoji).

    Verdict rules (aligned with local /review skill):
    - Request Changes: 1+ CRITICAL, or 1+ HIGH in Correctness/API Compat,
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
        return "Request Changes", ":red_circle:"
    if high_total > 0 or any(f.severity == "MEDIUM" for f in findings):
        return "Approve with Suggestions", ":yellow_circle:"
    return "Approve", ":green_circle:"


def severity_labels_for_pr(pr_number: int | None) -> SeverityLabelSet:
    """Pick a deterministic severity label set using the PR number hash.

    The returned map is keyed by canonical severity (CRITICAL/HIGH/MEDIUM),
    with display metadata at each level:
    - emoji: icon shown in the findings table
    - title: human-readable level name shown in report summaries/table
    """
    if pr_number is None:
        return SEVERITY_LABEL_SETS[0]
    hash_byte = hashlib.sha256(str(pr_number).encode("utf-8")).digest()[0]
    return SEVERITY_LABEL_SETS[hash_byte % len(SEVERITY_LABEL_SETS)]


def build_report(findings: list[Finding], run_url: str, pr_number: int | None = None) -> str:
    """Build the consolidated markdown report."""
    # Count by severity
    counts = {s: 0 for s in SEVERITY_ORDER}
    for f in findings:
        counts[f.severity] += 1

    verdict_text, verdict_emoji = determine_verdict(findings)
    severity_labels = severity_labels_for_pr(pr_number)

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
            f"| {sev_display} | {label} | {f.area} | `{f.location}` | {f.description} | {f.fix} |"
        )

    table = "\n".join(rows)
    summary = ", ".join(
        f"{counts[severity]} {severity_labels[severity][TITLE_KEY]}" for severity in SEVERITY_ORDER
    )

    return f"""{MARKER}
## :telescope: PR Review Fleet Report

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
    parser.add_argument("reviews_dir", type=Path, help="Directory containing review-*.md files")
    parser.add_argument("run_url", help="URL to the workflow run")
    parser.add_argument("-o", "--output", type=Path, default=Path("report.md"), help="Output file path")
    parser.add_argument("--pr-number", type=int, help="Pull request number for deterministic emoji set selection")
    args = parser.parse_args(argv)

    # Collect findings from all reviewer files
    all_findings: list[Finding] = []
    for reviewer_key, area_name in REVIEWERS.items():
        path = args.reviews_dir / f"review-{reviewer_key}.md"
        if not path.exists():
            print(f"{reviewer_key}: no output file")
            continue

        findings = parse_review_file(path, area_name)
        if not findings:
            print(f"{reviewer_key}: no issues found")
        else:
            print(f"{reviewer_key}: {len(findings)} finding(s)")
        all_findings.extend(findings)

    # Sort by severity order, then de-duplicate
    severity_rank = {s: i for i, s in enumerate(SEVERITY_ORDER)}
    all_findings.sort(key=lambda f: severity_rank.get(f.severity, 99))
    all_findings = deduplicate(all_findings)

    if not all_findings:
        print("All reviewers passed with no findings.")
        return 2

    report = build_report(all_findings, args.run_url, args.pr_number)
    args.output.write_text(report, encoding="utf-8")
    print(f"Report written to {args.output} ({len(all_findings)} findings)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
