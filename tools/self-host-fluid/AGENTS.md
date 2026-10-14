# AGENTS.md — deployment runbook

This file lets an **AI agent or a person** stand up and verify the self-host Fluid stack
through an ordered runbook. Execute phases **in order**. After each phase, run its **VERIFY**
step and do **not** proceed until it passes. If VERIFY fails, consult **Troubleshooting**
before retrying — do not loop blindly.

## Assumptions

- Docker and git are installed and the Docker daemon is running.
- The working directory is the repository root (the folder containing `docker-compose.redpanda.yml`).
- Both stacks BUILD the Fluid images from source. The published images evaluated during this
  project did not match the source revision and service topology used by this compose. Run
  the script matching the host arch.

---

## Phase 1 — Local stack (built from source)

**Goal:** full Routerlicious + Redpanda running locally, images built from FluidFramework source.

**Steps** (the helper fetches FluidFramework `main` into `./.fluidframework` and builds):

1. **amd64 host:** `./scripts/run-local.ps1` (PowerShell) or `./scripts/run-local.sh` (bash).
2. **arm64 host:** `./scripts/run-local-arm64.ps1` / `.sh` (patches the Dockerfiles for arm64).

To reuse an existing checkout instead of cloning, set `FLUID_REPO_DIR` to its repo root.
For an evidence-equivalent or production release, use a reviewed checkout or set `FLUID_REF`
to a reviewed branch/tag, then archive the exact commit, patch set, and resulting image digests.

**VERIFY** (all must hold):

- Use `docker-compose.redpanda.yml` on amd64 and `docker-compose.redpanda.arm64.yml` on arm64
  for every Compose command below.
- `docker compose -f <compose-file> ps` shows `alfred`, `nexus`, `historian` as `healthy`.
- `curl -fsS http://127.0.0.1:3003/healthz/startup` returns HTTP 200 (alfred via proxy).
- `curl -fsS http://127.0.0.1:3001/healthz/startup` returns HTTP 200 (historian via proxy).
- Run the ingress smoke test and expect `SMOKE PASS`:
  - amd64 bash / PowerShell: `./scripts/smoke-test.sh` / `./scripts/smoke-test.ps1`
  - arm64 bash: `./scripts/smoke-test.sh docker-compose.redpanda.arm64.yml`
  - arm64 PowerShell: `./scripts/smoke-test.ps1 -ComposeFile docker-compose.redpanda.arm64.yml`

The smoke test checks the two HTTP ingress routes and prints container status; it does not
replace the container-health assertions above or a Fluid client E2E run.

**On failure:** `docker compose -f <compose-file> logs --tail=100`. See Troubleshooting.

**Why build from source:** the published images evaluated during this project did not match
the separate `nexus` topology and `/healthz/startup` route used by this compose. Building
keeps the selected source revision and compose in lockstep.

---

## Phase 2 — Azure (AKS)

**Goal:** the same selected Routerlicious + Redpanda architecture on AKS, with images **built
from source and pushed to ACR**. The published images evaluated during this project did not
match the validated source revision and topology. The reference deployment uses **in-cluster
Mongo + Redis** and gitrest snapshots on an **Azure Files PV**. Managed database/cache services
and a production token backend are productionization choices (see the runbook's hardening section).

**Runbook — [azure/README.md](./azure/README.md) is authoritative.** Follow its phases in
order (each has a VERIFY step):

- **Phase 0** create the resource group and ACR.
- **Phase 1–3 [VALIDATED]:** build/push images with buildx
  (`--build-context root=.`; `az acr build` can't do it), create AKS, configure the image-pull
  secret, and deploy PVC-backed Redpanda + topics.
- **Phase 4 [VALIDATED]:** deploy the in-cluster backends; the gitrest Azure Files PVC binds RWX.
- **Phase 5–6 [VALIDATED]:** `helm install` the Routerlicious services; expose alfred, nexus,
  and historian; validate connect, create/attach, real-time sync, second-client cold-load and
  convergence, and audience presence with a real Fluid client.
- **Phase 7 [OPEN]:** the client **token Azure Function** did not connect. The validated path
  used `InsecureTokenProvider` (development only); production needs a trusted customer backend.

This is a validated **reference deployment**, not production-ready infrastructure. It uses
HTTP, single replicas, an unfinished production-auth path, and prototype secret handling. Do
not present restart persistence as broker high availability; see the Azure hardening register.

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `git clone` fails | `git` must reach github.com. Or set `FLUID_REPO_DIR` to a local FluidFramework checkout to skip cloning. |
| First build very slow | Expected — the first build compiles native deps (node-rdkafka); later builds reuse the Docker cache. Run the script matching the host arch. |
| Port already in use | Free ports `3001`, `3002`, `3003`, `5000`, `9092`, `9644`, `3022` on the host. |
| `alfred`/`nexus` not healthy | Give it up to ~1 min (healthcheck `start_period` 20s + retries). Then check `logs`. |
| Storage errors on op-heavy load | Confirm `gitrest` and `historian` are up; the `git` and `mongodata` volumes exist. |
| Local Redpanda / topic errors | Redpanda is aliased `kafka`; the local development stack may auto-create topics. Confirm both `rawdeltas` and `deltas` exist before restarting application services. |
| Azure reconnect storm / `Unable to allocate topic` | Confirm the PVC is bound and both topics exist with 8 partitions and replication factor 1. An `emptyDir` loses topics after rescheduling; use `azure/redpanda.yaml`, which includes the PVC and `fsGroup: 101`. |
| Smoke or e2e client hangs on `localhost` | Windows Docker Desktop IPv6 `localhost` forwarding can be broken (`localhost:3003` hangs, `127.0.0.1:3003` works). The scripts already use `127.0.0.1`; for the e2e run set `NODE_OPTIONS=--dns-result-order=ipv4first`. |

---

## Endpoints & defaults

| Service | Host port | Notes |
| --- | --- | --- |
| REST + websocket (alfred/nexus via proxy) | 3003 | primary client endpoint |
| nexus (delta stream) | 3002 | |
| historian (storage) | 3001 | |
| riddler (tenant manager) | 5000 | |
| redpanda | 9092 / 9644 | Kafka API / admin |
| git (ssh) | 3022 | snapshot git remote |

- Default tenant id: `fluid`.
- Data persists in the `git` and `mongodata` Docker volumes until `down -v`.

---

## Teardown

- Stop, keep data: `docker compose -f <compose-file> down`
- Stop, delete data: `docker compose -f <compose-file> down -v`
