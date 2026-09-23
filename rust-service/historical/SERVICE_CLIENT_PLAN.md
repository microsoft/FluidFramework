# SEA WASM and ServiceClient Integration Plan

Historical implementation plan. Status and checkboxes below record the planning state, not the current feature inventory.
For current behavior, see the [neutral client](../packages/sea-typescript/README.md), [Fluid driver](../packages/sea-driver/README.md), and [example utilities](../../examples/utils/example-utils/README.md).

Status: In progress; stages 1 through 4 are complete. Stage 5 example integration and interactive acceptance are next.
Created: 2026-09-18.

This is an active implementation plan, not a description of supported functionality.
Use [Sea architecture](../SEA_ARCHITECTURE.md) and [Development](../DEVELOPMENT.md) as the current design and validation authorities.
Archive this plan under [Historical records](README.md) when the work is complete, after moving supported usage and guarantees into the relevant package guides.

## Goals and Scope

Make SEA available through the Fluid `ServiceClient` API and the inventory-app example with two selectable configurations:

- An ephemeral in-memory service running locally through WebAssembly (WASM), without WebTransport or an external service process.
- A remote service using real WebTransport, including collaboration between independent browser windows.

First move the general JavaScript-facing SEA bindings out of `sea-webtransport` into a dedicated feature-gated WASM crate.
Expose them through `@fluidframework/sea-typescript`, the non-Fluid-specific entry point and sole direct SEA dependency for general TypeScript SEA applications.
Support both a combined WASM bundle and separate configuration-specific bundles without changing the application or driver logic.
Make adding another configuration, such as compression, a small extension of the same build and factory model.

## Fresh-Context Entry

1. Read this plan's scope and acceptance criteria, then the [project README](../README.md), [Sea architecture](../SEA_ARCHITECTURE.md), [Known Issues](../KNOWN_ISSUES.md), and [Development](../DEVELOPMENT.md).
2. Check the assigned worktree path, branch, HEAD, and working-tree status before editing; preserve existing changes and coordinate ownership of shared files.
3. Check the pinned Rust toolchain, matching `wasm-bindgen` version, package dependencies, and available browser and network access using the development and harness guides.
4. Start with the relevant implementation anchors below rather than assuming the proposed packages already exist.
	These paths describe the starting implementation; follow moved code and update the pointers as extraction proceeds.
5. Work only on stages 1 through 5.
	Record unavailable browser or network validation as blocked or unverified, never passed; distinguish a browser inside Codespaces from the user's external browser.

| Area | Starting points |
| --- | --- |
| WASM bindings and build | [Shared bindings](../crates/sea-wasm/src/bindings.rs), [package build script](../packages/sea-typescript/scripts/build-wasm.mjs), and [package build tasks](../packages/sea-typescript/package.json). |
| Generated-client adaptation | [Neutral-session adapter](../packages/sea-driver/src/sessionClient.ts) and [driver-owned contract](../packages/sea-driver/src/wasmClient.ts); Fluid projection is now owned by the driver. |
| TypeScript package conventions | [sea-driver](../packages/sea-driver/README.md) and its [manifest](../packages/sea-driver/package.json); reuse conventions, not Fluid-specific dependencies. |
| ServiceClient | [Shared contract](../../packages/common/driver-definitions/src/serviceClient.ts), [Tinylicious implementation](../../packages/drivers/tinylicious-driver/src/tinyliciousService.ts), and [runtime helpers](../../packages/runtime/runtime-utils/src/serviceClientUtils.ts). |
| Example selection and bundling | [Example helpers](../../examples/utils/example-utils/src/exampleApp.ts), [webpack configuration helper](../../examples/utils/webpack-fluid-loader/src/appConfig.ts), and [inventory-app guide](../../examples/data-objects/inventory-app/README.md). |
| Browser validation | [WebTransport harness](../tests/webtransport-browser/README.md) and [Fluid integration harness](../tests/sea-integration-tests/README.md). |

## Design Boundaries

| Owner | Responsibility |
| --- | --- |
| `sea-wasm` Rust crate | General SEA bindings and feature-gated local, remote, and decorator construction. |
| `@fluidframework/sea-typescript` | Non-Fluid-specific TypeScript SEA API, generated artifact packaging, typed loaders and factories, initialization, and combined/split presets. Initially expose internal APIs. |
| `sea-webtransport` | Transport implementation and protocol responsibilities, not ownership of all JavaScript-facing session APIs. |
| `sea-driver` | Fluid-specific projection, driver, and `ServiceClient` adaptation above `sea-typescript`, through an injected client factory; no SharedTree dependency or knowledge of bundle layout. |
| `example-utils` SEA setup module | Select a bundle-loader preset and map example service options to the appropriate factories. |
| Inventory-app | Consume the common example helpers without WASM or transport-specific application logic. |

The TypeScript package name is `@fluidframework/sea-typescript`; exact exports remain implementation decisions within these boundaries.
General TypeScript SEA applications obtain all SEA capabilities through its supported package entrypoints, without direct dependencies on generated WASM packages, crate output paths, or the integration harness.
Fluid applications may use `sea-driver` or `sea-tree` above this layer; `sea-typescript` must not re-export or depend on those adapters.
The package API and implementation must remain entirely non-Fluid-specific, without Fluid runtime, driver, or SharedTree dependencies, including development dependencies that would create cycles.
The resulting dependency graph must still allow SharedTree tests to consume `sea-driver` without a dependency cycle.

Split the existing generated-client adapter by responsibility rather than moving it wholesale.
General session bindings and neutral contracts belong in `sea-typescript`; Fluid message and summary interpretation and Fluid sequence projection belong in `sea-driver` or the appropriate higher-level adapter.
Do not copy driver-owned interfaces into `sea-typescript` merely to avoid a dependency edge.

### Reusable Session Stack Construction

Separate the shared, transport-independent WASM session bindings from construction of concrete session stacks.
Local memory, WebTransport, and decorated stacks must reuse the same session binding implementation.
General binding values must not require transport-protocol types that pull `sea-webtransport` into local-only builds.
Provide a browser-compatible session boundary on which the existing Rust session decorators can operate, rather than reimplementing decorator behavior in each binding.

Adding a stack of existing storage, transport, and decorator implementations should require only localized Rust composition, factory, and build-configuration changes.
Make decorator order explicit and preserve its semantics.
Named configurations assembled in Rust are sufficient; arbitrary runtime composition of every possible stack is not required.
Cargo features must enable or disable capabilities and their configuration factories without including dependencies of disabled capabilities.
TypeScript factories select supported configurations without exposing generated WASM details and reject unsupported configurations clearly.

Use compression over local and remote sessions as the first proof that this factoring works.
Compression-plus-encryption is an example of a future configuration the design should accommodate, not an additional implementation acceptance requirement.

### Separate Capabilities, Services, and Packaging

Cargo features choose capabilities at build time.
Service configuration chooses among the capabilities included in an artifact at runtime.
Bundle-loader configuration maps those service requirements to generated artifacts.
These are separate choices: changing packaging must not silently change storage, transport, compression, or lifetime semantics.

`sea-typescript` owns named build configurations and loader presets for its generated artifacts.
The application composition point owns the choice of preset; for inventory-app, this is the SEA setup module in `example-utils`.
Provide a build-time example option to compare combined and split presets without source edits.
Switching presets should change that one selection, not driver logic, service configuration, or inventory-app code.
Adding a capability may require a new build configuration and factory, but must not require copying the binding implementation.

Make generating multiple capability-specific bundles a supported build operation, not a manual source-editing workflow.
Each named build configuration specifies an explicit Cargo feature set and produces separate JavaScript and WASM artifacts for its supported JavaScript targets.
The initial configurations include:

| Bundle | Included capabilities |
| --- | --- |
| `webtransport` | Remote sessions only; no local storage, sequencer, compression, or encryption. |
| `memory` | Local memory service without WebTransport. |
| `combined` | Local memory and remote WebTransport sessions. |
| `webtransport-compression` | Remote sessions with compression support. |

Keep service configuration separate from these build names: including compression support does not implicitly enable compression for every session.
Build each variant in a separate Cargo invocation with `--no-default-features` and explicit features to prevent feature unification between variants.
Isolate generated outputs by configuration and JavaScript target, and track each variant's inputs and outputs for incremental builds.
Provide independently importable package loaders so selecting the minimal WebTransport bundle does not download other bundles.
Verify excluded dependencies and actual loading behavior, and measure generated JavaScript and WASM sizes with and without transfer compression.
No exact bundle-size target is promised before measurement.

Initialization is lazy and cached per loaded bundle.
An initialized WASM module is not an ephemeral service: create service instances explicitly, with independent storage unless callers deliberately share a service.
Keep services, sessions, decorator stacks, generated objects, and handles with the WASM instance that created them.
Do not pass WASM-owned objects between split bundles or rely on generated class identity across bundles.

## Implementation Stages

### Combined Execution of Stages 1 and 2

Implement stages 1 and 2 together as one sequential foundation phase.
Their checklists and acceptance criteria remain distinct, but they do not require separate implementation passes or duplicate consumer migrations.
The WASM crate and TypeScript package must establish their ownership and dependency direction together so generated artifacts have their intended package owner from the start.

Use this order within the combined phase:

1. Inventory the extraction boundary and create minimal `sea-wasm` and `@fluidframework/sea-typescript` scaffolding with the intended dependency direction.
2. Prove local, remote, and compressed event and blob round trips through shared session bindings and package entrypoints before broad consumer migration.
3. Complete capability-specific builds, generated-asset packaging, and dependency-exclusion checks.
4. Move neutral adaptation into `sea-typescript` and Fluid projection into `sea-driver`; migrate existing consumers directly to their owning package entrypoints, preserving existing tests.
5. Complete package conventions, documentation, generated API reports, tests, and the acceptance and validation gates for both stages before proceeding to stage 3.

Establish the factory and loading surface needed for this phase, but leave full combined/split preset behavior and comparative measurements to stage 3.
This combined phase does not require parallel workstreams or a numbered iteration and does not start ServiceClient or example integration.

Foundation progress: `sea-wasm` now has shared session operations over a concrete-handle-preserving adapter, and `sea-webtransport` has a typed session client that compiles for native and browser transports.
The `sea-typescript` package owns five isolated build configurations and exposes initial neutral memory and remote APIs.
Node package tests passed for memory and compression, and Chromium 152 inside the Codespace passed real plain/compressed WebTransport blob and event round trips, snapshot publication, and reopening.
See the [package guide](../packages/sea-typescript/README.md) for commands and limitations.
The foundation checkpoint is committed as `8defb28d049`.
Continuation work adds submission content references, snapshot lookup, classified factory failures, and safe close during asynchronous operations.
Fluid projection now lives in `sea-driver` as `SeaSessionDriverClient`, with summary tests, direct SharedTree package collaboration, and the real Chromium SharedTree lifecycle trace migrated to injected neutral factories.
The migrated Chromium trace passed eight consecutive runs after fixing archive-read lifetime across membership replacement and SEA author collisions between read-first containers.
Deterministic Node regressions cover both failure modes.
The browser benchmarks now use neutral factories for local and remote sessions, and the unused harness-owned generated-client adapter has been removed.
Capability-specific `internal/memory` and `internal/webtransport` entrypoints share the same initialization and lifetime implementation.
Eight small Chromium benchmark cases passed across both data structures, both integration paths, and both services; the runner now asserts selected-artifact-only loading.
The neutral WASM build task now skips unchanged work and regenerates missing outputs and changed feature configurations; validation restored the original minimal capabilities afterward.
At that checkpoint, low-level protocol consumers still used legacy bindings; their migration and removal remained required before stage 3.
The benchmark and loader checkpoint is committed as `f86f03c9c33`.
Node session scenarios now live in the neutral package; the canonical Node command runs twelve package tests plus three retained legacy-specific regressions.
The canonical browser command runs plain and compressed neutral sessions, and its ordered-delivery, explicit reopen, snapshot-suffix recovery, and shutdown checks now use the neutral WebTransport factory too.
The browser harness no longer builds or serves the legacy generated client.
Durable-file/client-selected and memory/SEA-selected browser runs passed in Chromium 152 inside the Codespace.
The browser lifecycle and shutdown checkpoint is committed as `6ee5ce4d002`.
The older Fluid driver browser trace now uses neutral sessions and runs in the canonical harness, preserving summary reload, two-client delivery, explicit pending recovery/resubmission, duplicate-free reconnect, and bounded historical reads.
Snapshot registration replacement and stale cancellation ownership now have a neutral Node regression, alongside the sequencer's focused test.
The optional JavaScript disconnect-hook and named-create tests were retired with their obsolete APIs; neither API exists on the neutral factory surface.
The transport-owned generated bindings, test-support feature, build script, consumer imports, and harness build dependencies have been removed.
The canonical Node suite now runs thirteen neutral package tests directly.
Combined stages 1 and 2 passed final acceptance after this extraction cleanup.
All five capability configurations rebuilt from the shared bindings; Cargo production dependency checks confirmed memory and minimal/ compressed remote exclusions.
Canonical Rust formatting, strict Clippy and rustdoc, workspace build/tests, documentation checks, `./test.sh`, scoped policy checks, and the repository-root build passed.
The memory/SEA-selected browser configuration and the separately invoked durable-file SharedTree lifecycle trace also passed in Chromium 152 inside the Codespace.
One canonical attempt timed out in the unchanged server test `idle_stream_outlives_operation_deadline_in_every_storage_mode`; its isolated rerun and the complete canonical rerun passed without a server-code change.
This timing risk remains recorded rather than treating the failed attempt as a pass.
Stage 3 preset equivalence and size measurements, ServiceClient integration, inventory UI acceptance, and external-browser connectivity remain unimplemented or unverified by this phase.

### 1. Extract and Package WASM Bindings

- [x] Inventory the existing general bindings, browser transport bindings, generated adapter, and consumers; identify the narrow extraction boundary.
- [x] Introduce `sea-wasm` with optional capabilities for local memory and WebTransport, leaving transport mechanics in their owning crate.
- [x] Separate neutral session binding values and operations from concrete stack construction; establish the browser-compatible session boundary needed to reuse existing Rust decorators.
- [x] Promote local memory from transport test support to a supported binding configuration.
- [x] Expose the existing compression decorator through an optional capability and an explicit configuration; preserve matching encode/decode configuration for collaborating clients.
- [x] Prove compressed event and blob round trips over local and remote sessions through the shared bindings before broad consumer migration; do not duplicate bindings or decorator logic for these stacks.
- [x] Identify general session binding code separately from Fluid-specific generated-client adaptation and coordinate its package extraction with stage 2 in the combined phase.
- [x] Provide local-only, WebTransport-only, combined, and compression-enabled named build configurations from the same binding source.
- [x] Isolate generated outputs by configuration and JavaScript target; prevent overwrites, stale outputs, and unintended Cargo feature unification between variants.
- [x] Register generated artifacts and their inputs in the Fluid build graph, including clean and incremental builds, package exports, and browser asset loading.
- [x] Migrate existing Node.js, browser, Fluid-driver, and direct SharedTree consumers directly to the package entrypoints established with stage 2, without losing their current tests; this is the same migration tracked in stage 2.
- [x] Document the new crate responsibilities and record the architectural decision under `historical/decisions/`.

Acceptance: generated local and remote clients retain their existing behavior; the local-only WASM dependency graph excludes `sea-webtransport`; the minimal WebTransport build excludes local storage, sequencer, compression, and encryption dependencies.
Adding the compression configurations demonstrates localized stack construction and shared bindings without copying session operations.
Test capability-specific builds as well as the all-features build, since the latter cannot detect missing feature guards.

### 2. Establish the sea-typescript Package

- [x] Create `@fluidframework/sea-typescript` under the Rust-service TypeScript packages, following neighboring repository package conventions.
- [x] Make it the sole direct SEA dependency needed by general TypeScript SEA applications, covering local memory, remote sessions, and optional decorators through package entrypoints.
- [x] Move general generated-client bindings and neutral session contracts into the package; keep Fluid-specific projection and adaptation in the higher-level adapters.
- [x] Encapsulate generated WASM artifacts and their loading so consumers do not import crate output paths or depend directly on generated packages.
- [x] Expose independently importable loaders for capability-specific bundles, including minimal WebTransport, through package entrypoints.
- [x] Configure workspace registration, dependency declarations, standard build tasks, exports and generated entrypoints, internal API release tags, generated API reports, TypeScript and documentation configuration, formatting, lint, and package metadata according to repository practices.
- [x] Add a package README and API documentation for session capabilities, initialization, resource ownership, errors, and supported environments without Fluid-specific concepts.
- [x] Migrate existing consumers to package entrypoints and preserve driver and direct SharedTree integration tests in their owning packages or harnesses.
- [x] Add non-Fluid consumer tests for local sessions and browser WebTransport, and dependency checks that prevent reverse dependencies on the Fluid adapters or harness.
- [x] Validate the package's build, tests, policy compliance, and generated-asset resolution through its entrypoints before starting ServiceClient integration.

Acceptance: a general TypeScript application can use SEA with only `@fluidframework/sea-typescript` as its direct SEA dependency.
The package has no Fluid-specific API or implementation requirements and follows the repository's TypeScript package conventions.
Fluid adapters consume this layer, not the reverse; existing higher-level tests remain intact.

### 3. Add Stable Factories and Packaging Presets

`createSeaFactories` selects split or combined artifacts independently of session options and reuses the same ownership helpers as the capability entrypoints.
The merged socket factory remains separate and unchanged; selecting either preset never enables socket fallback.
The combined-compression configuration adds compression support without enabling it implicitly.
Node and fresh-page Chromium scenarios cover both presets, explicit sharing/isolation, capability rejection, initialization caching, and exact selected-artifact loading.
The [package guide](../packages/sea-typescript/README.md#artifact-measurements) records raw/gzip/Brotli artifact sizes, build provenance, and tradeoffs.
Example selection remains unchanged; the build-time example preset override and non-SEA UI acceptance remain stage 5 responsibilities.

Stage 3 validation passed all canonical Rust gates, documentation checks, `./test.sh`, scoped repository policy, and root `pnpm build:fast`.
The package has twenty-one passing local tests; its additional server-backed Node socket test passed in the optional browser harness.
Fresh-page Chromium 152 inside the Codespace passed both presets with and without compression under durable-file/client-selected and memory/SEA-selected configurations.
The merged ordinary-WebSocket browser and Node collaboration paths and bounded server shutdown also passed.
These results do not establish external-browser or inventory UI acceptance.

- [x] Expose typed factories that hide generated bundle details from consumers while keeping service ownership and cleanup explicit.
- [x] Supply combined and split loader presets and make their selection independent of service options.
- [x] Cache initialization per bundle without sharing ephemeral document storage implicitly.
- [x] Keep optional capabilities lazy at the package boundary; the existing examples still have no SEA dependency, and their post-integration no-fetch check is tracked in stage 5.
- [x] Verify that selecting the minimal WebTransport loader fetches only its own generated JavaScript and WASM artifacts, not memory, combined, or decorator-enabled bundles.
- [x] Test explicit sharing between clients of one ephemeral service and isolation between separate services.
- [x] Exercise the same local and remote scenarios through both presets, plus a compression-enabled scenario that proves the extension mechanism.
- [x] Record generated and compressed artifact sizes and observed loading behavior with build configuration and environment details.

Acceptance: changing one loader selection switches combined/split packaging without changes to application logic or service semantics.
The minimal WebTransport configuration passes remote-session scenarios without loading other bundles; dependency inspection and artifact-size measurements accompany the loading evidence.
An unsupported capability produces a useful error; no silent transport fallback is allowed.
Measurements support later comparison; this stage does not require an extensive benchmark project or a permanent choice of packaging strategy.

### 4. Implement the ServiceClient API

`createSeaServiceClient` now uses the standard runtime and ServiceClient helpers with an injected neutral session factory.
The driver remains independent of SharedTree and generated artifact layout.
Focused Node tests passed creation, attachment, reload, registry and compatibility options, and failure cleanup.
Failure injection exposed an existing initial-summary ownership leak; `SeaDriver.createContainer` now disposes its not-yet-transferred service on failure, with a direct driver regression as well as the ServiceClient test.
Chromium 152 inside the Codespace passed all four remote preset/compression cases, including bidirectional edits and reopening after both clients close.
The canonical Rust gates, documentation check, `./test.sh`, repository policy, dependency-layer checks, and root `pnpm build:fast` passed.
The root build required formatting the changed layer declaration before its successful rerun.
No inventory UI or external-browser result is claimed by stage 4.

- [x] Follow the existing Tinylicious and shared runtime utility patterns rather than introducing another container framework.
- [x] Support detached creation, attachment, attached creation, loading by the returned document identity, registry-based data stores, `oldestSupportedClient`, and container cleanup.
- [x] Provide local ephemeral and remote WebTransport construction through injected factories, preserving `sea-driver` dependency isolation.
- [x] Document service lifetime, document identity, failure handling, and the limits inherited from SEA's current Fluid adapter.
- [x] Add focused contract tests for creation, attachment, loading, registry behavior, option propagation, and cleanup; reuse existing test helpers where practical.

Acceptance: both SEA configurations satisfy the supported `ServiceClient` contract, not just the attached-creation path used by inventory-app.
An API wrapper must not imply support for automatic reconnect, presence, authentication, production membership, or other currently unsupported semantics.
Escalate a genuine contract conflict instead of silently weakening the shared API.

### 5. Integrate the Example Utilities and Inventory-App

- [ ] Add explicit example selectors, provisionally `sea-ephemeral` and `sea-webtransport`, while preserving existing options and default behavior.
- [ ] Verify that existing non-SEA example selections do not initialize or fetch SEA WASM after integration.
- [ ] Place the loader-preset choice in the example-utils SEA setup module, with a build-time override for packaging comparisons.
- [ ] Provide endpoint and development certificate configuration for the remote option; do not embed credentials or introduce a silent local fallback.
- [ ] Integrate asynchronous WASM startup behind the existing helper contract where practical; audit callers before changing a shared helper signature.
- [ ] Update example build tooling, launch commands, and usage documentation, including generated documentation sources where applicable.
- [ ] Add focused service-selection tests, then perform the interactive acceptance matrix below.

Acceptance: the same inventory application runs with every listed service option without transport-specific application code.
The local SEA option works in a supported WASM browser through ordinary Codespaces page hosting, with no SEA server, QUIC connectivity, or certificate setup.
Document actual browser prerequisites instead of claiming support in every environment.

## Interactive Acceptance Matrix

Use the actual inventory UI for item creation, deletion, and quantity changes.
Record browser/version, environment, service and packaging configuration, commands, observed results, console/network errors, and any remaining blockers.
Retain a small reproducible browser regression test for distinct integration behavior rather than relying only on a manual report.

| Service | Required behavior | Persistence and collaboration limits |
| --- | --- | --- |
| Default selection | Starts successfully and retains the established fallback behavior. | Uses the existing service-selection semantics. |
| TypeScript ephemeral | Create and edit inventory. | Reload persistence and independent-window collaboration are not required. |
| TypeScript session | Create, edit, and reload in the same tab. | Independent tabs do not imply a shared live service. |
| Tinylicious | Create, edit from both windows, converge, reload, and reopen the same document. | Run a reachable Tinylicious service. |
| SEA ephemeral | Create and edit inventory with no WebTransport or external service process. | Test collaboration between clients sharing one explicitly created local service; no independent-window sharing or reload persistence is promised. |
| SEA WebTransport | Create, edit from both independent windows, converge, reload, and reopen after both windows close. | Keep the service running; use durable storage for any separately claimed server-restart persistence. |

For remote collaboration, use the same returned document URL in independent clients, including separate browser contexts where practical.
Verify edits in both directions and concurrent edits converge; then close both clients and reopen the document.
Confirm real WebTransport sessions rather than accepting UI rendering or a local fallback as transport evidence.
Run SEA acceptance with both combined and split packaging.
Perform a compression-enabled collaboration scenario with matching configuration and verify that the decorator path is actually used.

Codespaces evidence must state whether the browser ran inside the Codespace or on the user's machine.
An internal Chromium run does not establish that external interactive access works.
Leave a usable example URL and concise startup instructions for the user, and document cleanup of test-owned services and browser resources.

## Validation and Documentation Gates

Run the narrowest behavioral checks after each implementation change, then the required integration gates at completion.
Follow [Development](../DEVELOPMENT.md) and the [coordination skill](../../.github/skills/rust-service-coordination/SKILL.md); commands below are a checklist, not a replacement for those authorities.

From `rust-service/`:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps
cargo build --workspace --all-targets
cargo test --workspace --all-targets --all-features
node scripts/check-documentation.mjs
./test.sh
```

From the repository root for the implementation:

```bash
pnpm policy-check --path rust-service
pnpm build:fast
```

Also run the owning package tests and checks for changes to example-utils and inventory-app.
Verify generated artifacts work from a clean build and that changing a feature configuration correctly invalidates incremental outputs.
Generate API reports through package tooling; never edit them by hand.
Add changesets for user-facing behavior and API changes according to repository guidance.
Update architecture and package guides to describe actual supported behavior, replacing the WASM-ownership TODO only after the extraction is complete.

## Execution and Completion

Stages 1 through 5 define this plan's implementation scope.
Execute stages 1 and 2 together using the combined foundation order above, then stages 3, 4, and 5 in dependency order.
One owner can implement the main chain sequentially without numbered iteration overhead.
If parallel investigation or separate workstreams justify a full iteration, ask for that workflow choice before creating iteration records or worktrees.
This plan does not select or start an iteration.

Record decisions and validation evidence as work proceeds.
The completion summary must distinguish implemented capabilities, observed interactive results, unsupported behavior, and deferred work.
No packaging choice, passing build, or internal browser test substitutes for the corresponding behavioral acceptance criterion.
