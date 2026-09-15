# Decision 0009: Projected Operation Subscription

Status: accepted
Date: 2026-09-13
Iteration: 0008
Owners: GitHub Copilot implementation agent
Supersedes: none
Superseded by: none

## Context

Projected operation consumers previously repeated bounded `ReadProjected` requests. A read followed by a separately established tail can miss an append at the boundary, while polling adds convergence delay and cannot express transport-owned cancellation or backpressure.

## Decision Drivers

The contract must preserve opaque positions, exact accepted-operation order, explicit ambiguity recovery, bounded memory, immediate cancellation, and native shutdown ownership. Summary and storage operations remain request/response, and the service must not change durable-log or sequencer append semantics.

## Options and Evidence

Polling preserves existing framing but does not provide a live contract. A canonical append-stream subscription would cross the workstream boundary and expose storage concerns. A document-local bounded notification registered under the service document lock can wake cursor-based projected catch-up without carrying payloads or becoming authoritative.

The iteration 0008 service A/B/C, lag, duplicate, gap, resume, native cancellation, and shutdown tests validate the document-local design. Generated-WASM and Fluid driver tests validate that request/response traffic remains independent of the live stream.

## Decision

FSP4 protocol version 2 adds request kind `14`, `SubscribeProjected { document, after }`, and response kind `74`, one `ProjectedOperation` frame. A subscription sends repeated operation frames with the initiating request ID. Each operation carries the existing opaque position and unchanged projected metadata and payload.

The service registers a bounded wake-up receiver while holding the document lock, then catches up and resumes exclusively through opaque projected cursors. Wake-up lag is advisory: the cursor read remains authoritative and prevents gaps or duplicates. Service errors terminate with the existing typed error frame. Client or server cancellation terminates the transport stream; there is no successful terminal frame for an intentionally live subscription.

Native connections own a bounded set of stream futures. Browser and injected WASM subscriptions expose serialized `next()` and explicit `cancel()` operations with bounded frame buffering. Summary, blob, snapshot, submission, resolution, and bounded history APIs remain request/response.

## Consequences

Clients receive push-driven operation convergence without polling, canonical position exposure, hidden append retry, detached tasks, or unbounded channels. Cancellation is observable as stream termination, and reconnect requires an explicit new subscription from the last delivered opaque cursor.

The notification mechanism is single-host and process-local; reopening a document reconstructs it and cursor catch-up covers committed history. Production membership, retention, batching, and fallback transports remain deferred. Protocol version 1 peers are intentionally rejected rather than silently interpreting version 2 frames.

## Validation and Follow-Up

The protocol round-trip and bounds tests, service atomic-boundary and lag tests, native WebTransport lifecycle tests, generated-WASM contract tests, Chromium SharedTree trace, and retained benchmark evidence are the iteration 0008 validation set. Reconsider if a replicated service requires a durable notification primitive, if bounded browser framing cannot tolerate transport chunking, or if production membership changes the projected cursor contract.