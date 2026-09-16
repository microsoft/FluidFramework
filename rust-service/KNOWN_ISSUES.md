# Known Issues

This file tracks current limitations of the experimental Sea implementation.
Historical architecture findings remain in `decisions/` and `iterations/`.

## RS-003: Durable storage has qualified guarantees

- **Status:** Open
- **Severity:** High
- **Area:** Durability
- **Evidence:** `sea-file-durable` synchronizes its log and metadata and passes deterministic process-termination recovery tests.
  It has not been qualified against power loss, filesystem or hardware failure, concurrent process ownership, or remote storage.
- **Impact:** `durable-file` must not be interpreted as a production durability claim.
- **Trigger:** Define a precise durability tier and add platform-specific fault testing before using the backend for production data.

## RS-015: Retention and garbage collection are not implemented

- **Status:** Deferred
- **Severity:** Medium
- **Area:** Content and history lifetime
- **Evidence:** All three `SeaStorage` backends retain every event, snapshot, blob, directory, and unattached upload.
  Event and snapshot publication atomically validate and retain referenced tree closures, but no root is later released.
- **Impact:** Storage grows monotonically and stale-position or unavailable-history behavior cannot yet be exercised.
- **Trigger:** Add leases, retention boundaries, and collection when a bounded deployment supplies concrete lifetime requirements.

## RS-017: Session eviction is explicit, not time based

- **Status:** Deferred
- **Severity:** Medium
- **Area:** Sequencing
- **Evidence:** `sea-sequencer` persists session activation, replacement, explicit close, and reference state.
  It terminates lagged subscribers but does not expire inactive authors or persist a clock-based reconnect grace policy.
- **Impact:** An abandoned author can pin the reported minimum reference until replacement or explicit close.
- **Trigger:** Define authoritative timeout and reconnect policies before minimum reference is used to delete retained history.

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
  Stateful dictionaries are immutable out-of-band configuration, and no separate authenticated plaintext identity is exposed.
- **Impact:** Encryption does not hide archive shape or directory names, and dictionary rotation requires replacing decorator configuration.
- **Trigger:** Design encrypted directories, plaintext identity, or Sea-managed dictionaries only for a concrete consumer requirement.

## RS-021: Legacy append-stream traits remain for benchmarks

- **Status:** Deferred
- **Severity:** Low
- **Area:** API cleanup
- **Evidence:** Service, transport, generated clients, and examples use `SeaStorage` and `SeaSession`, but the benchmark harness and compatibility tests still use `EventStream`, `SnapshotStore`, and backend-specific position wrappers.
- **Impact:** `sea-core` and storage packages expose two experimental API generations.
- **Trigger:** Port the remaining benchmark matrix to archive/session APIs, then remove the legacy traits and wrappers in one mechanical cleanup.

## RS-022: The Fluid adapter is not a production driver

- **Status:** Deferred
- **Severity:** High
- **Area:** Fluid integration
- **Evidence:** The adapter passes typed local-client and real Chromium SharedTree traces, recursive summary reconstruction, handle reuse, explicit reconnect, and caller-driven resubmission.
  It still uses synthetic membership and omits authentication, signals, presence, automatic reconnect, offline merge, loading groups, and GC policy.
- **Impact:** The adapter is integration evidence, not a Routerlicious or ODSP replacement.
- **Trigger:** Define production membership and connection policy before broadening the supported Fluid surface.