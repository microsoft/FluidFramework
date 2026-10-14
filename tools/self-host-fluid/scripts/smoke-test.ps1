#!/usr/bin/env pwsh
# Ingress smoke test: print container status and verify two HTTP routes through the proxy.

param([string]$ComposeFile)

$root = Split-Path -Parent $PSScriptRoot
if (-not $ComposeFile) { $ComposeFile = Join-Path $root "docker-compose.redpanda.yml" }
$compose = $ComposeFile
$fail = 0

Write-Host "== Container status ==" -ForegroundColor Cyan
docker compose -f $compose ps

Write-Host "`n== Ingress checks ==" -ForegroundColor Cyan
$checks = @(
    @{ Name = "alfred REST   (3003)"; Url = "http://127.0.0.1:3003/healthz/startup" },
    @{ Name = "historian     (3001)"; Url = "http://127.0.0.1:3001/healthz/startup" }
)
foreach ($c in $checks) {
    try {
        $r = Invoke-WebRequest -Uri $c.Url -TimeoutSec 5 -UseBasicParsing
        if ($r.StatusCode -eq 200) { Write-Host ("PASS  {0} -> 200" -f $c.Name) -ForegroundColor Green }
        else { Write-Host ("FAIL  {0} -> {1}" -f $c.Name, $r.StatusCode) -ForegroundColor Red; $fail++ }
    } catch {
        Write-Host ("FAIL  {0} -> {1}" -f $c.Name, $_.Exception.Message) -ForegroundColor Red; $fail++
    }
}

Write-Host ""
if ($fail -eq 0) {
    Write-Host "SMOKE PASS - ingress routes are responding." -ForegroundColor Green
    Write-Host "  REST + websocket     : http://127.0.0.1:3003"
    Write-Host "  Storage (historian)  : http://127.0.0.1:3001"
    Write-Host "  Tenant mgr (riddler) : http://127.0.0.1:5000"
    Write-Host ""
    Write-Host "This ingress smoke does not assert every container or the Fluid op pipeline."
    Write-Host "For full gates, see AGENTS.md and VALIDATION.md."
    exit 0
} else {
    Write-Host "SMOKE FAIL - $fail check(s) failed. Inspect logs:" -ForegroundColor Red
    Write-Host "  docker compose -f `"$compose`" logs --tail=100"
    exit 1
}
