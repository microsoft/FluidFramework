#!/usr/bin/env pwsh
# One-command local bring-up of the self-host Fluid (redpanda-full) stack on amd64.
# Fetches the FluidFramework source (a shallow clone into ./.fluidframework), builds the
# images from source, starts the stack, waits for health, and runs the smoke test.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$compose = Join-Path $root "docker-compose.redpanda.yml"

# Load the supported source-selection values unless the caller already exported them.
$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $root ".env.example") $envFile }
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*(FLUID_REPO_DIR|FLUID_REF)\s*=\s*(.*?)\s*$') {
        $name = $Matches[1]
        if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
            [Environment]::SetEnvironmentVariable($name, $Matches[2], "Process")
        }
    }
}

# --- Preflight ---------------------------------------------------------------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is not installed or not on PATH. Install Docker Desktop and retry."
}
docker info 1>$null 2>$null
if ($LASTEXITCODE -ne 0) { throw "Docker daemon is not running. Start Docker Desktop and retry." }

$serverArch = (docker version --format '{{.Server.Arch}}' 2>$null)
if ($serverArch -eq "arm64") {
    throw "Docker server arch is arm64. This amd64 build uses the stock upstream Dockerfile (amd64 base). For native arm64, run ./scripts/run-local-arm64.ps1 instead."
}

# --- Resolve the FluidFramework source (build context root) ------------------
# Default: shallow-clone FluidFramework from GitHub into ./.fluidframework (gitignored).
# To reuse an existing checkout, set FLUID_REPO_DIR to its repo root before running.
$explicitRepo = [bool]$env:FLUID_REPO_DIR
$fluidRepo = if ($explicitRepo) {
    if ([System.IO.Path]::IsPathRooted($env:FLUID_REPO_DIR)) {
        $env:FLUID_REPO_DIR
    } else {
        Join-Path $root $env:FLUID_REPO_DIR
    }
} else { Join-Path $root ".fluidframework" }
$marker = Join-Path $fluidRepo "server\routerlicious\Dockerfile"
if (-not (Test-Path $marker)) {
    if ($explicitRepo) {
        throw "FLUID_REPO_DIR is set to '$($env:FLUID_REPO_DIR)' but it does not look like a FluidFramework repo (missing server/routerlicious/Dockerfile). Point it at the repo root, or unset it to auto-clone from GitHub."
    }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "git is required to fetch FluidFramework. Install git, or set FLUID_REPO_DIR to a local checkout."
    }
    $ref = if ($env:FLUID_REF) { $env:FLUID_REF } else { "main" }
    Write-Host "Fetching FluidFramework source ($ref) from GitHub into $fluidRepo ..." -ForegroundColor Cyan
    git clone --depth 1 --branch $ref https://github.com/microsoft/FluidFramework $fluidRepo
    if ($LASTEXITCODE -ne 0) { throw "git clone of FluidFramework failed." }
}

# Apply FLUID_REF on every run for the helper-managed checkout. Do not mutate a checkout supplied
# through FLUID_REPO_DIR; its owner selects and reviews that revision.
if (-not $explicitRepo -and $env:FLUID_REF) {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "git is required to select FLUID_REF in the helper-managed checkout."
    }
    git -C $fluidRepo diff --quiet
    $worktreeDirty = $LASTEXITCODE -ne 0
    git -C $fluidRepo diff --cached --quiet
    $indexDirty = $LASTEXITCODE -ne 0
    if ($worktreeDirty -or $indexDirty) {
        throw "Helper-managed FluidFramework checkout has tracked local changes; refusing to switch FLUID_REF."
    }
    git -C $fluidRepo fetch --depth 1 origin $env:FLUID_REF
    if ($LASTEXITCODE -ne 0) { throw "Unable to fetch FLUID_REF '$($env:FLUID_REF)'." }
    git -C $fluidRepo checkout --detach FETCH_HEAD
    if ($LASTEXITCODE -ne 0) { throw "Unable to check out FLUID_REF '$($env:FLUID_REF)'." }
}
$env:FLUID_REPO_DIR = ((Resolve-Path $fluidRepo).Path -replace '\\', '/')
Write-Host "Building Fluid images from: $env:FLUID_REPO_DIR" -ForegroundColor Cyan

# --- Build + up --------------------------------------------------------------
Write-Host "Building images and starting the stack (first build compiles native deps; can take several minutes)..." -ForegroundColor Cyan
docker compose -f $compose up -d --build
if ($LASTEXITCODE -ne 0) { throw "docker compose up --build failed. See output above." }

# --- Wait for readiness ------------------------------------------------------
Write-Host "Waiting for the REST endpoint to become healthy (up to 3 minutes)..."
$deadline = (Get-Date).AddMinutes(3)
$ready = $false
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:3003/healthz/startup" -TimeoutSec 4 -UseBasicParsing
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Write-Host "  ...still starting"
}
if (-not $ready) {
    Write-Warning "REST endpoint did not report healthy in time. Check: docker compose -f docker-compose.redpanda.yml logs"
}

# --- Smoke test --------------------------------------------------------------
& (Join-Path $PSScriptRoot "smoke-test.ps1") -ComposeFile $compose
