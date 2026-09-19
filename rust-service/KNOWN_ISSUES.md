# Known Issues

This file tracks current limitations of the experimental Sea implementation.
Historical architecture findings remain in `decisions/` and `iterations/`.

## RS-003: Durable storage has qualified guarantees

- **Status:** Open
- **Severity:** High
- **Area:** Durability
- **Evidence:** `sea-file-durable` synchronizes its journal and namespace metadata and passes deterministic incomplete-write, corruption, and post-sync recovery tests through the shared file engine.
  Advisory OS locks exclude competing valid document openings, but the backend has not been qualified against power loss, filesystem or hardware failure, external replacement of locked files, or remote storage.
- **Impact:** `durable-file` must not be interpreted as a production durability claim.
- **Trigger:** Define a precise durability tier and add platform-specific fault testing before using the backend for production data.

## RS-015: Retention and garbage collection are not implemented

- **Status:** Deferred
- **Severity:** Medium
- **Area:** Content and history lifetime
- **Evidence:** All three `SeaStorage` backends retain every event, snapshot, blob, directory, and unattached upload.
  The composed view establishes dependencies before event and snapshot publication, and recovery checks dependency closure, but no root is later released.
- **Impact:** Storage grows monotonically and stale-position or unavailable-history behavior cannot yet be exercised.
- **Trigger:** Add leases, retention boundaries, and collection when a bounded deployment supplies concrete lifetime requirements.

## RS-018: Authentication and tenant policy are host work

- **Status:** Deferred
- **Severity:** High
- **Area:** Security
- **Evidence:** Sessions are archive-bound and do not expose archive-independent content fetches, but the built-in host accepts opaque archive, author, and session bytes without authenticating them.
- **Impact:** The executable is suitable only for controlled experimental environments.
- **Trigger:** Add a host authorization context and policy before exposing Sea across a trust boundary.

## RS-019: Server configuration is intentionally minimal

- **Status:** Deferred
- **Severity:** Low
- **Area:** Deployment
- **Evidence:** The server accepts bind, TLS, data-root, and optional shutdown-marker arguments; `SEA_STORAGE_MODE` selects one of three compiled-in backends.
  Frame, connection, and stream limits use library defaults, and backends cannot be omitted with Cargo features.
- **Impact:** Operators cannot tune limits or reduce binary size without source changes.
- **Trigger:** Add validated CLI/environment precedence and backend features when a deployment or binary-size measurement requires them.

## RS-020: Transformation metadata remains visible

- **Status:** Deferred
- **Severity:** Medium
- **Area:** Confidentiality and transforms
- **Evidence:** Session decorators transform event payloads and blob leaves.
  Directory names, topology, event ordering metadata, and snapshot metadata remain visible so the server can validate references.
  No separate authenticated plaintext identity is exposed.
- **Impact:** Encryption does not hide archive shape or directory names.
- **Trigger:** Design encrypted directories or plaintext identity only for a concrete consumer requirement.

## RS-022: The Fluid adapter is not a production driver

- **Status:** Deferred
- **Severity:** High
- **Area:** Fluid integration
- **Evidence:** The adapter passes generated local-client and real Chromium SharedTree traces, recursive summary reconstruction, handle reuse, explicit reconnect, and caller-driven resubmission.
  The neutral-session path now projects ordered membership and passes the multi-driver lifecycle smoke; legacy injected benchmark clients retain synthetic membership.
  Authentication, signals, presence, automatic reconnect, offline merge, loading groups, and GC policy remain incomplete.
- **Impact:** The adapter is integration evidence, not a Routerlicious or ODSP replacement.
- **Trigger:** Complete the opt-in integration inventory and connection-policy regressions before claiming production support.

## RS-024: A durable enforced minimum-reference floor is missing

- **Status:** Open
- **Severity:** High
- **Area:** Sequencer reference admission and Fluid efficiency
- **Evidence:** The active-member minimum can decrease when sessions open with old or absent references; absent references also bypass the comparison using `Option::zip`.
  There is no durable independent floor-advance record or restored document-wide floor.
  The Fluid adapter reports minimum sequence zero as a temporary correctness workaround.
- **Impact:** Clients cannot safely release old collaboration state based on an advancing minimum, even though server history retention is a separate concern.
- **Required fix:** Persist and deliver ordered monotonic floor advances, reject new submissions below the committed floor, restore it on recovery, and project it consistently into Fluid replay and snapshots.
  Keep advancement policy separate from enforcement; debounce advances where useful.

## RS-025: Driver explicit retry is not application-owned resubmission

- **Status:** Open
- **Severity:** High
- **Area:** Fluid pending-operation recovery
- **Evidence:** `SeaDeltaConnection.resubmitPending` can resend the stored message with a new outer reference without requiring an unaccepted-prefix proof or a caller-transformed payload.
- **Impact:** Non-idempotent or reference-dependent events can be duplicated or interpreted under an incorrect submission context.
- **Required fix:** Recover the old session's accepted prefix through its terminal leave, and delegate transformation and fresh-session submission to the application/Fluid runtime.
  Do not confuse exact outcome lookup with resubmission.

## Codespaces forwarding requires the optional WebSocket transport

- **Status:** Open
- **Severity:** Medium
- **Area:** Browser development workflow
- **Evidence:** As checked on 2026-09-18, [GitHub documents Codespaces forwarding as TCP](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace), but the native SEA listener uses HTTP/3 over QUIC/UDP.
  Public visibility and HTTPS forwarding do not bridge those protocols.
  See the [investigation findings](historical/CODESPACES_WEBTRANSPORT_PLAN.md#initial-findings-2026-09-18) for implementation evidence, alternatives, and unverified routes.
- **Impact:** Making the default QUIC port public is still insufficient.
  The off-by-default `websocket-stream` adapter and separate TCP listener passed actual SEA collaboration through public forwarding in a Windows Chromium-based integrated browser.
  Native `WebSocketStream` preserves receive backpressure; explicit `WebSocket` and `PreferAvailable` modes also permit ordinary WebSocket for Node and browsers without the streaming API.
  Ordinary reception cannot apply backpressure: the adapter fails on queue overflow rather than silently dropping data, and its per-socket limits do not bound runtime or proxy memory.
  It requires explicit endpoint selection, trusted TLS termination, and a backend-visible Origin allowlist; it is not production authentication.
  Node's built-in WebSocket sends no Origin and requires the separate default-off, direct-loopback admission option; do not enable it on public/forwarded endpoints.
- **Trigger:** Integrate the opt-in adapter into an application-level development workflow with an explicit exposure/authentication policy.
  Preserve FIN/cancellation semantics and the strict modes' independent-stream backpressure; opt into ordinary WebSocket only when its weaker receive guarantees are acceptable.
  Local Chromium and Node flows passed; the user also reported a passing Windows Firefox 156 ordinary-WebSocket collaboration flow through public Codespaces forwarding.
  A logged-out browser run remains unverified.
  See [setup and validation](tests/webtransport-browser/README.md#optional-websocketstream-validation).
