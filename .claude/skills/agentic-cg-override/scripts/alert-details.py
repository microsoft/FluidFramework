#!/usr/bin/env python3
"""Show detailed information about alerts for a specific package or CVE.

Usage:
  python3 alert-details.py <query> [input-dir]

  query: a package name (e.g. "tar") or CVE ID (e.g. "CVE-2025-7783")
  input-dir: directory containing production.json and non-production.json
             fetched by fetch-cg-alerts.sh (default: /tmp/cg-alerts)

Shows only active (non-dismissed, non-fixed) alerts on the main branch.
Prints component details, recommended action, advisory links, and pipeline info,
grouped by production vs non-production.
"""

import json
import os
import sys

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}

def load_alerts(path):
    with open(path) as f:
        data = json.load(f)
    return data["value"]

def is_active_on_main(alert):
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

def matches_query(alert, query):
    q = query.lower()
    comp = alert.get("component", {})
    pkg_name = comp.get("displayName", "") if isinstance(comp, dict) else ""
    title = alert.get("title", "")
    return q in pkg_name.lower() or q in title.lower()

def print_alert(a):
    comp = a.get("component", {})
    pkg = comp.get("displayName", "?") if isinstance(comp, dict) else "?"
    ver = comp.get("displayVersion", "?") if isinstance(comp, dict) else "?"
    pkg_type = comp.get("type", "?") if isinstance(comp, dict) else "?"

    print(f"--- {pkg}@{ver} ---")
    print(f"  Severity:    {a.get('severity', '?')}")
    print(f"  Type:        {a.get('type', '?')}")
    print(f"  Title:       {a.get('title', '?')}")
    print(f"  Package:     {pkg}@{ver} ({pkg_type})")
    print(f"  Discovered:  {a.get('discoveredDate', '?')}")

    action = a.get("actionItems", "")
    if action:
        print(f"  Action:      {action}")

    sources = a.get("sources", {})
    if isinstance(sources, dict):
        for source_name, source_info in sources.items():
            if isinstance(source_info, dict):
                url = source_info.get("url", "")
                identifier = source_info.get("identifier", "")
                print(f"  Advisory:    {identifier} — {url}")

    # Pipeline info from stateDetails (deduplicated)
    details = a.get("stateDetails", [])
    seen_pipelines = set()
    if isinstance(details, list):
        for d in details:
            if isinstance(d, dict) and d.get("alertState") == "active" and "main" in d.get("branchMoniker", ""):
                snap = d.get("snapshotType", {})
                pipeline = snap.get("buildDisplayType", "")
                phase = snap.get("phaseDisplayName", "")
                tracking = snap.get("externalTrackingState", "")
                key = (pipeline, phase)
                if pipeline and key not in seen_pipelines:
                    seen_pipelines.add(key)
                    print(f"  Pipeline:    {pipeline} ({phase}) [{tracking}]")
    print()

def print_matches(matched, label):
    if not matched:
        return
    matched.sort(key=lambda a: (
        SEVERITY_ORDER.get(a.get("severity", ""), 99),
        a.get("component", {}).get("displayVersion", "") if isinstance(a.get("component"), dict) else "",
    ))
    print(f"{'#' * 80}")
    print(f"  {label}: {len(matched)} alert(s)")
    print(f"{'#' * 80}\n")
    for a in matched:
        print_alert(a)

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 alert-details.py <package-name-or-cve> [input-dir]")
        sys.exit(1)

    query = sys.argv[1]
    input_dir = sys.argv[2] if len(sys.argv) > 2 else "/tmp/cg-alerts"

    prod_path = os.path.join(input_dir, "production.json")
    nonprod_path = os.path.join(input_dir, "non-production.json")

    has_prod = os.path.exists(prod_path)
    has_nonprod = os.path.exists(nonprod_path)

    if not has_prod and not has_nonprod:
        print(f"ERROR: No alert files found in {input_dir}/", file=sys.stderr)
        print("Run fetch-cg-alerts.sh first.", file=sys.stderr)
        sys.exit(1)

    found_any = False

    if has_prod:
        prod_alerts = load_alerts(prod_path)
        prod_active = [a for a in prod_alerts if is_active_on_main(a)]
        prod_matched = [a for a in prod_active if matches_query(a, query)]
        if prod_matched:
            found_any = True
            print_matches(prod_matched, "PRODUCTION")

    if has_nonprod:
        nonprod_alerts = load_alerts(nonprod_path)
        nonprod_active = [a for a in nonprod_alerts if is_active_on_main(a)]
        nonprod_matched = [a for a in nonprod_active if matches_query(a, query)]
        if nonprod_matched:
            found_any = True
            print_matches(nonprod_matched, "NON-PRODUCTION / STALE")

    if not found_any:
        print(f"No active alerts matching '{query}' on main.")

if __name__ == "__main__":
    main()
