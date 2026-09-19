# Iteration 0006 Retrospective

## What We Expected

We expected native connection concurrency to be a narrow prerequisite and the minimal driver surface to be close to sufficient for a one-field SharedTree proof. Work was split into a native scheduling wave followed by a dependent browser-consumer wave, with Node used for deterministic WASM faults and Chromium used for actual WebTransport.

## What We Observed

The wave dependency was correct: concurrent browser sessions required a server accept loop that did not await each complete connection. Once integrated, three real containers could create/load, exchange opaque SharedTree operations, recover a disconnected edit explicitly, and replay into a fresh container.

The adapter was not close to sufficient initially. Fluid required valid claims, exact summary shape, membership, sequence/MSN translation, batching metadata, mode-aware lifecycle behavior, and monotonic author-scoped client sequences. Default read-to-write reconnect remained incomplete, so the final browser proof uses a documented force-write gate. Graceful server drain also remains unimplemented.

## Costly Issues and Dead Ends

For each substantial effort sink, record the trigger, attempted approaches, evidence that stopped the work, approximate impact, root cause if known, and prevention or faster diagnostic for next time. Use `none` only after reviewing all workstream notable-event tables.

- Serial accept-loop prerequisite: [native concurrency report](phase-2/native-connection-concurrency.md#hypothesis-results). Impact was small and isolated; a two-session test immediately discriminated the scheduler defect.
- SharedTree load/convergence protocol work: [direct integration notable events](phase-2/direct-shared-tree-integration.md#notable-events). Most effort went into distinguishing payload delivery from Fluid envelope/membership invariants. Capturing stage, connection state, envelope metadata, and error telemetry was the fastest successful diagnostic.
- Replay author collapse: live views converged to `2`, while cold replay reported duplicate client sequence `1`. Translating remote client sequence from authoritative projected order fixed it without decoding payloads.
- Delegated validation summaries twice reported the wrong checkout or omitted decisive output, and one claimed a bundle build that had run elsewhere. Direct `pwd`, branch, artifact existence, and machine-readable output were required. This repeated an existing lesson rather than exposing a missing instruction.
- Integration initially failed because workspace-linked Fluid `lib/` outputs and ignored generated WASM/bundle artifacts were absent. Building exact dependency packages and generating both binding targets made the test reproducible.

## Agentic Development Findings

The two-wave decomposition and isolated worktrees prevented conflicts and made the concurrency handoff explicit. The direct integration instructions correctly prohibited FSQ2 decoding and hidden retry, which kept debugging focused on framework contracts.

The SharedTree workstream was substantially more exploratory than estimated. Frequent browser runs were justified because each exposed a distinct framework invariant. Tool delegation was unreliable for checkout identity and large machine-readable output; direct commands were necessary for acceptance evidence. The user supplied scope ordering and a request to parallelize, but no implementation correction.

## Practices to Keep, Change, or Stop

- Keep: dependency waves, isolated worktrees, exact browser evidence, and explicit separation of injected Node faults from Chromium transport claims. Owner: coordinator.
- Keep: record envelope metadata and lifecycle state before inspecting opaque application payloads. Owner: Fluid adapter workstream.
- Change: reject delegated command evidence whenever reported branch/path differs or exact requested counts are absent; rerun narrowly and directly. Owner: coordinator. This is already required by the skill.
- Change: integration checklists for generated consumers must include existence and execution of fresh ignored artifacts, not only successful source compilation. Owner: integration coordinator.
- Stop: using a transient pending-map observation as proof that a fast asynchronous submit occurred; await owned work and assert externally visible convergence instead. Owner: test authors.

## Durable Lessons

Two findings were promoted: opaque DDS payload transport still requires full framework envelope semantics, and collapsing identities requires translating every author-scoped monotonic field together. Both apply to adapters beyond SharedTree and explain failures that otherwise resemble payload corruption.

## Open Questions

- What minimal shared state must a document service preserve across read-to-write stream replacement: projected cursor, checkpoint, writer/session identity, pending submissions, and membership?
- Can faithful multi-writer Fluid membership be projected without inventing service-level join/leave records or changing FSP4?
- Should graceful server shutdown cancel immediately, drain accepted streams to a deadline, or expose both policies?
- When the lifecycle is stable, what equivalent TypeScript/Routerlicious workload can support a fair complexity and bandwidth comparison?
