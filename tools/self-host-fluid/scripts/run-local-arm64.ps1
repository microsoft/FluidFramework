#!/usr/bin/env pwsh
# Native arm64 bring-up: builds the Fluid images from a FluidFramework checkout,
# starts the redpanda-full stack, waits for health, and runs the smoke test.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$compose = Join-Path $root "docker-compose.redpanda.arm64.yml"

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
if ($serverArch -ne "arm64") {
    Write-Warning "Docker server arch is '$serverArch', not arm64. This variant builds native arm64 images; on amd64 use ./scripts/run-local.ps1 (also builds from source)."
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
# Normalize to forward slashes for compose interpolation.
$env:FLUID_REPO_DIR = ((Resolve-Path $fluidRepo).Path -replace '\\', '/')
Write-Host "Building Fluid images from: $env:FLUID_REPO_DIR" -ForegroundColor Cyan

# --- Generate arm64 Dockerfiles from the CURRENT upstream source on every run:
#     drop the amd64 digest pin + use the arm64 tini. --------------------------
foreach ($svc in @("routerlicious", "historian", "gitrest")) {
    $src = Join-Path $env:FLUID_REPO_DIR "server/$svc/Dockerfile"
    $dst = Join-Path $env:FLUID_REPO_DIR "server/$svc/Dockerfile.arm64"
    if (Test-Path $src) {
        $c = (Get-Content -Raw $src) -replace '@sha256:[0-9a-f]{64}', '' -replace '/tini /tini', '/tini-arm64 /tini'
        [System.IO.File]::WriteAllText($dst, $c, [System.Text.UTF8Encoding]::new($false))
        Write-Host "  generated server/$svc/Dockerfile.arm64 (patched from upstream Dockerfile)"
    }
}

# --- Build + up --------------------------------------------------------------
Write-Host "Building arm64 images and starting the stack..." -ForegroundColor Cyan
Write-Host "(first build compiles node-rdkafka natively for arm64 and can take several minutes)"
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
    Write-Warning "REST endpoint did not report healthy in time. Check: docker compose -f docker-compose.redpanda.arm64.yml logs"
}

# --- Smoke test --------------------------------------------------------------
& (Join-Path $PSScriptRoot "smoke-test.ps1") -ComposeFile $compose
