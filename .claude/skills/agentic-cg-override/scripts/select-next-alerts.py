#!/usr/bin/env python3
"""Select active production security CVEs that aren't already in an open [cg-fixer] PR.

Usage:
  python3 select-next-alerts.py [--max N] [--input-dir DIR] [--repo OWNER/REPO]

Reads alerts fetched by fetch-cg-alerts.sh from <input-dir>/production.json, filters to
active security alerts on main, excludes CVEs already covered by open `[cg-fixer]` PRs
(queried via `gh pr list`), and prints a JSON array of the top N to stdout.

Each output item has: cve, package, versions, action, severity, advisory_url, title.

Legal alerts are skipped — they require human license review.
Non-production/stale alerts are skipped — production is the primary focus.
"""

import argparse
import json
import os
import re
import subprocess
import sys

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}
CVE_PATTERN = re.compile(r"CVE-\d{4}-\d+", re.IGNORECASE)
GHSA_PATTERN = re.compile(r"GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}", re.IGNORECASE)


def is_active_on_main(alert):
    if alert.get("isDismissed", False):
        return False
    details = alert.get("stateDetails", [])
    if not isinstance(details, list):
        return False
    return any(
        isinstance(detail, dict)
        and detail.get("alertState") == "active"
        and "main" in detail.get("branchMoniker", "")
        for detail in details
    )


def extract_vuln_id(alert):
    """Prefer a CVE ID from title or sources; fall back to GHSA; finally the raw title."""
    candidates = [alert.get("title", "")]
    sources = alert.get("sources", {})
    if isinstance(sources, dict):
        for source_info in sources.values():
            if isinstance(source_info, dict):
                candidates.append(source_info.get("identifier", ""))

    for text in candidates:
        match = CVE_PATTERN.search(text or "")
        if match:
            return match.group(0).upper()

    for text in candidates:
        match = GHSA_PATTERN.search(text or "")
        if match:
            return match.group(0).upper()

    return (alert.get("title") or "").strip() or "unknown"


def get_advisory_url(alert):
    sources = alert.get("sources", {})
    if not isinstance(sources, dict):
        return ""
    for source_info in sources.values():
        if isinstance(source_info, dict):
            url = source_info.get("url", "")
            if url:
                return url
    return ""


def get_in_flight_ids(repo):
    """Return the set of CVE/GHSA IDs already covered by open [cg-fixer] PRs."""
    cmd = ["gh", "pr", "list", "--search", "[cg-fixer] in:title", "--state", "open",
           "--json", "title", "--limit", "100"]
    if repo:
        cmd.extend(["--repo", repo])
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=30)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as err:
        print(f"WARN: could not query open PRs ({err}); assuming none are in-flight.",
              file=sys.stderr)
        return set()

    try:
        prs = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return set()

    ids = set()
    for pull_request in prs:
        title = pull_request.get("title", "")
        for match in CVE_PATTERN.findall(title):
            ids.add(match.upper())
        for match in GHSA_PATTERN.findall(title):
            ids.add(match.upper())
    return ids


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--max", type=int, default=5, help="Maximum CVEs to return (default: 5)")
    parser.add_argument("--input-dir", default="/tmp/cg-alerts",
                        help="Directory containing production.json (default: /tmp/cg-alerts)")
    parser.add_argument("--repo", default=os.environ.get("GH_REPO", ""),
                        help="owner/repo for `gh pr list` (default: $GH_REPO or current repo)")
    args = parser.parse_args()

    prod_path = os.path.join(args.input_dir, "production.json")
    if not os.path.exists(prod_path):
        print(f"ERROR: {prod_path} not found. Run fetch-cg-alerts.sh first.", file=sys.stderr)
        sys.exit(1)

    with open(prod_path) as alert_file:
        alerts = json.load(alert_file).get("value", [])

    active_security = [
        alert for alert in alerts
        if is_active_on_main(alert) and alert.get("type") == "security"
    ]
    print(f"Active production security alerts: {len(active_security)}", file=sys.stderr)

    in_flight = get_in_flight_ids(args.repo)
    print(f"In-flight CVE/GHSA IDs in open [cg-fixer] PRs: "
          f"{sorted(in_flight) if in_flight else '[]'}", file=sys.stderr)

    grouped = {}
    for alert in active_security:
        vuln_id = extract_vuln_id(alert)
        if vuln_id in in_flight:
            continue

        component = alert.get("component", {})
        package_name = component.get("displayName", "?") if isinstance(component, dict) else "?"
        version = component.get("displayVersion", "?") if isinstance(component, dict) else "?"

        key = (vuln_id, package_name)
        if key not in grouped:
            grouped[key] = {
                "cve": vuln_id,
                "package": package_name,
                "versions": set(),
                "action": alert.get("actionItems", ""),
                "severity": alert.get("severity", "unknown"),
                "advisory_url": get_advisory_url(alert),
                "title": alert.get("title", ""),
            }
        grouped[key]["versions"].add(version)

    ordered = sorted(
        grouped.values(),
        key=lambda item: (SEVERITY_ORDER.get(item["severity"], 99), item["cve"], item["package"]),
    )
    selected = ordered[: args.max]

    output = [
        {
            "cve": item["cve"],
            "package": item["package"],
            "versions": sorted(item["versions"]),
            "action": item["action"],
            "severity": item["severity"],
            "advisory_url": item["advisory_url"],
            "title": item["title"],
        }
        for item in selected
    ]

    print(f"Selected {len(output)} CVE(s) (max {args.max}):", file=sys.stderr)
    for item in output:
        print(f"  {item['severity']:<9} {item['cve']:<20} "
              f"{item['package']} @ {', '.join(item['versions'])}", file=sys.stderr)

    json.dump(output, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
