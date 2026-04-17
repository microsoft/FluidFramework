#!/usr/bin/env python3
"""Summarize active CG alerts from the raw API responses.

Usage: python3 summarize-alerts.py [input-dir]
  input-dir: directory containing production.json and non-production.json
             fetched by fetch-cg-alerts.sh (default: ~/.cg-alerts)

Prints a summary table of all active (non-dismissed, non-fixed) alerts on the main branch,
grouped by production vs non-production, then by legal vs security, sorted by severity.
"""

import json
import os
import sys
from collections import Counter

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}

def load_alerts(path):
    with open(path) as f:
        data = json.load(f)
    return data["value"]

def is_active_on_main(alert):
    """An alert is active on main if it is not dismissed and has an 'active' stateDetails
    entry whose branchMoniker contains 'main'."""
    if alert.get("isDismissed", False):
        return False
    details = alert.get("stateDetails", [])
    if not isinstance(details, list):
        return False
    return any(
        isinstance(d, dict)
        and d.get("alertState") == "active"
        and "main" in d.get("branchMoniker", "")
        for d in details
    )

def deduplicate(active):
    """Group alerts by (title, package_name) -> {versions, severity, type, ...}."""
    seen = {}
    for a in active:
        title = a.get("title", "?")
        comp = a.get("component", {})
        pkg = comp.get("displayName", "?") if isinstance(comp, dict) else "?"
        ver = comp.get("displayVersion", "?") if isinstance(comp, dict) else "?"
        key = (title, pkg)
        if key not in seen:
            seen[key] = {
                "severity": a.get("severity", "?"),
                "type": a.get("type", "?"),
                "versions": set(),
                "actionItems": a.get("actionItems", ""),
                "sources": a.get("sources", {}),
            }
        seen[key]["versions"].add(ver)
    return seen

def sort_key(item):
    return (SEVERITY_ORDER.get(item[1]["severity"], 99), item[0][1], item[0][0])

def print_section(seen, heading):
    """Print legal alerts first, then security alerts, under a top-level heading."""
    legal_items = {k: v for k, v in seen.items() if v["type"] == "legal"}
    security_items = {k: v for k, v in seen.items() if v["type"] != "legal"}

    print()
    print("#" * 120)
    print(f"  {heading}")
    print("#" * 120)

    # Severity summary
    all_items = list(seen.values())
    sev_counts = Counter(v["severity"] for v in all_items)
    type_counts = Counter(v["type"] for v in all_items)
    print(f"\nActive alerts: {len(seen)}")
    print("By severity:", ", ".join(f"{s}: {sev_counts[s]}" for s in sorted(sev_counts, key=lambda s: SEVERITY_ORDER.get(s, 99))))
    print("By type:", ", ".join(f"{t}: {type_counts[t]}" for t, _ in type_counts.most_common()))
    print()

    if legal_items:
        print("=" * 120)
        print("LEGAL ALERTS — require manual review (cannot be fixed programmatically)")
        print("=" * 120)
        print(f"{'Sev':<9} {'Type':<8} {'Package':<35} {'Vuln versions':<30} {'Title'}")
        print("-" * 120)
        for (title, pkg), info in sorted(legal_items.items(), key=sort_key):
            versions = ", ".join(sorted(info["versions"]))
            if len(versions) > 28:
                versions = versions[:25] + "..."
            print(f"{info['severity']:<9} {info['type']:<8} {pkg:<35} {versions:<30} {title}")
        print()

    if security_items:
        print("=" * 120)
        print("SECURITY ALERTS — can be fixed with pnpm overrides")
        print("=" * 120)
        print(f"{'Sev':<9} {'Type':<8} {'Package':<35} {'Vuln versions':<30} {'CVE/Title'}")
        print("-" * 120)
        for (title, pkg), info in sorted(security_items.items(), key=sort_key):
            versions = ", ".join(sorted(info["versions"]))
            if len(versions) > 28:
                versions = versions[:25] + "..."
            print(f"{info['severity']:<9} {info['type']:<8} {pkg:<35} {versions:<30} {title}")
        print()

    print(f"Total unique (CVE/title, package) pairs: {len(seen)} ({len(legal_items)} legal, {len(security_items)} security)")

def main():
    input_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cg-alerts")

    prod_path = os.path.join(input_dir, "production.json")
    nonprod_path = os.path.join(input_dir, "non-production.json")

    has_prod = os.path.exists(prod_path)
    has_nonprod = os.path.exists(nonprod_path)

    if not has_prod and not has_nonprod:
        print(f"ERROR: No alert files found in {input_dir}/", file=sys.stderr)
        print("Run fetch-cg-alerts.sh first.", file=sys.stderr)
        sys.exit(1)

    if has_prod:
        prod_alerts = load_alerts(prod_path)
        prod_active = [a for a in prod_alerts if is_active_on_main(a)]
        prod_dedup = deduplicate(prod_active)
        print_section(prod_dedup, "PRODUCTION ALERTS")

    if has_nonprod:
        nonprod_alerts = load_alerts(nonprod_path)
        nonprod_active = [a for a in nonprod_alerts if is_active_on_main(a)]
        nonprod_dedup = deduplicate(nonprod_active)
        print_section(nonprod_dedup, "NON-PRODUCTION / STALE ALERTS")

if __name__ == "__main__":
    main()
