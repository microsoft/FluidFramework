#!/usr/bin/env bash
# Native arm64 bring-up: builds the Fluid images from a FluidFramework checkout,
# starts the redpanda-full stack, waits for health, and runs the smoke test.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="$ROOT/docker-compose.redpanda.arm64.yml"

# Load the supported source-selection values unless the caller already exported them.
ENV_FILE="$ROOT/.env"
[ -f "$ENV_FILE" ] || cp "$ROOT/.env.example" "$ENV_FILE"
while IFS='=' read -r key value; do
  value="${value%$'\r'}"
  case "$key" in
    FLUID_REPO_DIR|FLUID_REF)
      if [ -z "${!key+x}" ]; then export "$key=$value"; fi
      ;;
  esac
done < "$ENV_FILE"

# --- Preflight ---------------------------------------------------------------
command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker is not installed or not on PATH."; exit 1; }
docker info >/dev/null 2>&1 || { echo "ERROR: Docker daemon is not running."; exit 1; }

ARCH="$(docker version --format '{{.Server.Arch}}' 2>/dev/null || true)"
if [ "$ARCH" != "arm64" ]; then
  echo "WARNING: Docker server arch is '$ARCH', not arm64. This variant builds native arm64"
  echo "         images; on amd64 use ./scripts/run-local.sh (also builds from source)."
fi

# --- Resolve the FluidFramework source (build context root) ------------------
# Default: shallow-clone FluidFramework from GitHub into ./.fluidframework (gitignored).
# To reuse an existing checkout, set FLUID_REPO_DIR to its repo root before running.
explicit_repo=0
if [ -n "${FLUID_REPO_DIR:-}" ]; then
  explicit_repo=1
  case "$FLUID_REPO_DIR" in
    /*) ;;
    *) FLUID_REPO_DIR="$ROOT/$FLUID_REPO_DIR" ;;
  esac
  if [ ! -f "$FLUID_REPO_DIR/server/routerlicious/Dockerfile" ]; then
    echo "ERROR: FLUID_REPO_DIR is set to '$FLUID_REPO_DIR' but it does not look like a FluidFramework repo"
    echo "  (missing server/routerlicious/Dockerfile). Point it at the repo root, or unset it to auto-clone."
    exit 1
  fi
else
  FLUID_REPO_DIR="$ROOT/.fluidframework"
  if [ ! -f "$FLUID_REPO_DIR/server/routerlicious/Dockerfile" ]; then
    command -v git >/dev/null 2>&1 || { echo "ERROR: git is required to fetch FluidFramework (or set FLUID_REPO_DIR to a local checkout)."; exit 1; }
    REF="${FLUID_REF:-main}"
    echo "Fetching FluidFramework source ($REF) from GitHub into $FLUID_REPO_DIR ..."
    git clone --depth 1 --branch "$REF" https://github.com/microsoft/FluidFramework "$FLUID_REPO_DIR"
  fi
fi

# Apply FLUID_REF on every run for the helper-managed checkout. Do not mutate a checkout supplied
# through FLUID_REPO_DIR; its owner selects and reviews that revision.
if [ "$explicit_repo" -eq 0 ] && [ -n "${FLUID_REF:-}" ]; then
  if ! git -C "$FLUID_REPO_DIR" diff --quiet || ! git -C "$FLUID_REPO_DIR" diff --cached --quiet; then
    echo "ERROR: helper-managed FluidFramework checkout has tracked local changes; refusing to switch FLUID_REF."
    exit 1
  fi
  git -C "$FLUID_REPO_DIR" fetch --depth 1 origin "$FLUID_REF"
  git -C "$FLUID_REPO_DIR" checkout --detach FETCH_HEAD
fi
FLUID_REPO_DIR="$(cd "$FLUID_REPO_DIR" && pwd)"
export FLUID_REPO_DIR
echo "Building Fluid images from: $FLUID_REPO_DIR"

# --- Generate arm64 Dockerfiles from the CURRENT upstream source on every run:
#     drop the amd64 digest pin + use the arm64 tini. --------------------------
for svc in routerlicious historian gitrest; do
  src="$FLUID_REPO_DIR/server/$svc/Dockerfile"
  dst="$FLUID_REPO_DIR/server/$svc/Dockerfile.arm64"
  if [ -f "$src" ]; then
    sed -e 's/@sha256:[0-9a-f]\{64\}//' -e 's#/tini /tini#/tini-arm64 /tini#' "$src" > "$dst"
    echo "  generated server/$svc/Dockerfile.arm64 (patched from upstream Dockerfile)"
  fi
done

# --- Build + up --------------------------------------------------------------
echo "Building arm64 images and starting the stack..."
echo "(first build compiles node-rdkafka natively for arm64 and can take several minutes)"
docker compose -f "$COMPOSE" up -d --build

# --- Wait for readiness ------------------------------------------------------
echo "Waiting for the REST endpoint to become healthy (up to 3 minutes)..."
deadline=$(( $(date +%s) + 180 ))
ready=0
while [ "$(date +%s)" -lt "$deadline" ]; do
  sleep 5
  if curl -fsS --max-time 4 http://127.0.0.1:3003/healthz/startup >/dev/null 2>&1; then
    ready=1; break
  fi
  echo "  ...still starting"
done
[ "$ready" -eq 1 ] || echo "WARNING: REST endpoint did not report healthy in time. Check: docker compose -f docker-compose.redpanda.arm64.yml logs"

# --- Smoke test --------------------------------------------------------------
exec "$(dirname "${BASH_SOURCE[0]}")/smoke-test.sh" "$COMPOSE"
