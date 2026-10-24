#!/usr/bin/env bash
# Ingress smoke test: print container status and verify two HTTP routes through the proxy.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="${1:-$ROOT/docker-compose.redpanda.yml}"
fail=0

echo "== Container status =="
docker compose -f "$COMPOSE" ps

echo ""
echo "== Ingress checks =="
check() {
  local name="$1" url="$2" code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)"
  code="${code:-000}"
  if [ "$code" = "200" ]; then
    echo "PASS  $name -> 200"
  else
    echo "FAIL  $name -> $code"
    fail=$((fail+1))
  fi
}
check "alfred REST   (3003)" "http://127.0.0.1:3003/healthz/startup"
check "historian     (3001)" "http://127.0.0.1:3001/healthz/startup"

echo ""
if [ "$fail" -eq 0 ]; then
  echo "SMOKE PASS - ingress routes are responding."
  echo "  REST + websocket     : http://127.0.0.1:3003"
  echo "  Storage (historian)  : http://127.0.0.1:3001"
  echo "  Tenant mgr (riddler) : http://127.0.0.1:5000"
  echo ""
  echo "This ingress smoke does not assert every container or the Fluid op pipeline."
  echo "For full gates, see AGENTS.md and VALIDATION.md."
  exit 0
else
  echo "SMOKE FAIL - $fail check(s) failed. Inspect logs:"
  printf '  docker compose -f %q logs --tail=100\n' "$COMPOSE"
  exit 1
fi
