# Known Issues

This file tracks known architecture and organization issues in the Rust service.
Add new issues with a stable identifier, status, severity, evidence, impact, and
resolution direction. When an issue is resolved, retain the entry, set its
status to `Resolved`, and link the validating change or report.

Statuses are `Open`, `In progress`, `Resolved`, and `Deferred`. Severity records
the issue's architectural or maintenance impact, not production readiness; this
project remains an experimental research project.

## RS-001: Service construction is coupled to concrete storage backends

- **Status:** Open
- **Severity:** High
- **Area:** Service composition
- **Evidence:** `crates/service/Cargo.toml` depends directly on the memory,
  file-simple, and durable-log implementations. `ServiceLog` in
  `crates/service/src/lib.rs` is a private enum over those implementations, and
  `ServiceLog::open` selects among them through `StorageMode`.
- **Impact:** Adding an external backend or changing the storage composition
  requires modifying the service crate. The core storage contracts are
  pluggable, but that extensibility does not reach the primary service assembly.
- **Resolution direction:** Introduce a service-facing storage factory or
  registration boundary that preserves concrete position and error handling
  without requiring every backend to be compiled into the service.

## RS-002: Storage wrappers are not composable through the native service

- **Status:** Open
- **Severity:** Medium
- **Area:** Service composition
- **Evidence:** Compression, encryption, and stateful compression implement the
  core contracts and are documented as layers between sequencing and storage,
  but `fluid-native-service` neither depends on them nor provides configuration
  for composing them with a selected backend.
- **Impact:** Wrapper compositions are available to direct users and benchmarks
  but cannot be selected in the standard native service. The documented
  architecture therefore describes a broader composition model than the
  service currently exposes.
- **Resolution direction:** Make wrappers selectable at the storage factory or
  composition root. Keep ordering explicit because compression and encryption
  order affects semantics and efficiency.

## RS-003: The default durable storage name overstates demonstrated guarantees

- **Status:** Open
- **Severity:** High
- **Area:** Durability contract
- **Evidence:** `StorageMode::DurableFile` is the default service mode and is
  described as durable file storage. Its implementation is
  `snapshotted-stream-durable-log-spike`, whose README explicitly limits its
  evidence to recovery after process termination while the operating system
  remains running. It does not demonstrate power-loss, filesystem or hardware
  failure, multi-process writer safety, retention, or replication.
- **Impact:** Callers can reasonably interpret `DurableFile` and
  `Durability::Durable` as stronger guarantees than the backend has established.
- **Resolution direction:** Rename the service mode or make its qualification
  prominent at the API and service README boundaries. Define the durability
  vocabulary precisely before presenting this backend as production-capable.

## RS-004: Content storage has no common substitution boundary

- **Status:** Open
- **Severity:** Medium
- **Area:** Content storage
- **Evidence:** The service switches between a private `MemoryContentStore` and
  the filesystem `ContentStore` through the private `ServiceContentStore` enum.
  The content-addressed crate provides concrete storage types rather than a
  shared service-facing trait.
- **Impact:** Alternative content stores require service changes, memory and
  filesystem policy are split across crates, and callers cannot reuse a common
  abstraction independently of the service.
- **Resolution direction:** Define a focused content-store contract and provide
  memory and filesystem implementations behind the service composition root.

## RS-005: The documented crate graph is stale

- **Status:** Open
- **Severity:** Medium
- **Area:** Project documentation
- **Evidence:** The top-level README describes `WORKSTREAMS.md` as the record of
  crate dependencies and composition coverage, but that document still presents
  the iteration `0001` graph. It omits the current protocol, service,
  content-addressed, encryption, stateful-compression, transport, and browser
  crates and the later integration paths.
- **Impact:** A reader using the designated architecture map receives an
  incomplete view and must reconstruct the current graph from Cargo manifests.
- **Resolution direction:** Replace or supplement the historical iteration graph
  with a current generated or maintained architecture graph. Clearly label
  historical ownership information as such.

## RS-006: Large crates concentrate unrelated responsibilities in `lib.rs`

- **Status:** Open
- **Severity:** Medium
- **Area:** Source organization
- **Evidence:** `fluid-sequencer`, `fluid-native-service`, and
  `fluid-service-protocol` each combine their public model, implementation,
  codecs or storage adaptation, and extensive tests in one `lib.rs`. Several
  transport and client crates follow the same pattern.
- **Impact:** Navigation, code ownership, and focused review become harder as
  these crates grow. Architectural boundaries visible in documentation are less
  visible in the source layout.
- **Resolution direction:** Split modules along established responsibilities,
  such as protocol messages and codecs; sequencer sessions, projection, and
  fencing; and service documents, content, storage, and subscriptions. Avoid
  changing public APIs solely for file organization.

## RS-007: Operational limits are hardcoded in service implementation

- **Status:** Open
- **Severity:** Medium
- **Area:** Service configuration
- **Evidence:** Canonical and projected read limits, content limits, and buffer
  sizes are constants in `crates/service/src/lib.rs`. `ServiceConfig` exposes
  only the root path and storage mode, while the protocol independently defines
  decoding limits.
- **Impact:** Deployments with different workload or resource constraints need
  source changes, and protocol and service bounds can evolve independently.
- **Resolution direction:** Group operational bounds into validated service
  configuration and make their relationship to protocol limits explicit.

## RS-008: The `wrappers` directory combines distinct architectural roles

- **Status:** Open
- **Severity:** Low
- **Area:** Crate organization
- **Evidence:** `crates/wrappers/` contains transparent storage decorators,
  process transport, native and browser WebTransport endpoints, and an
  in-process browser service adapter.
- **Impact:** The directory name suggests one composition role even though its
  members have different dependency directions, lifecycle concerns, and public
  boundaries.
- **Resolution direction:** Consider grouping crates by role, such as storage
  decorators, transports, and browser adapters, when the benefit outweighs the
  workspace and path churn.

## Explicitly Deferred Capabilities

Retention, cross-host fencing, power-loss qualification, production membership,
authentication, deployment, decoded-size policy, and awaitable Fluid teardown
are documented future triggers in `README.md`. They are not tracked above as
architecture defects. Add individual entries if later evidence identifies a
specific design or implementation problem rather than an intentionally absent
capability.
