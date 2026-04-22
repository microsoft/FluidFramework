#!/usr/bin/env bash
# One-shot CG triage for OCE rotation: refresh the alert cache, print the active
# backlog, and select the next unclaimed security CVE.
#
# Usage: pnpm cg-triage [--max N]
#   --max N  how many next CVEs to print (default: 1)
#
# The picker excludes any CVE already covered by an open [cg-fixer] PR, so two
# OCEs triaging at the same time will not pick the same CVE.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAX=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --max)
      MAX="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

echo "== Fetching CG alerts from ADO =="
bash "$SCRIPT_DIR/fetch-cg-alerts.sh"

echo
echo "== Active alert backlog =="
python3 "$SCRIPT_DIR/summarize-alerts.py"

echo
echo "== Next $MAX CVE(s) to work on =="
python3 "$SCRIPT_DIR/select-next-alerts.py" --max "$MAX"
