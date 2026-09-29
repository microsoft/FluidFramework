# Decision 0031: Primary Client Errors With Supplementary Diagnostics

Status: accepted
Date: 2026-09-29
Iteration: none (follow-up to 0020)
Owners: User and implementation coordinator
Supersedes: [0030: Defer Compound Client Errors](0030-defer-compound-client-errors.md)
Superseded by: none

## Context

[Decision 0030](0030-defer-compound-client-errors.md) deferred repair of a confirmed client recovery defect.
Failed cleanup replaced the initiating timeout, so a mutating request could lose its ambiguous classification.
The user subsequently approved an atomic migration of all in-repository consumers.
There are no external consumers requiring compatibility with the old Rust enum constructors or patterns.

## Decision Drivers

- Keep handling based on the initiating failure, without additional cases for diagnostic-only errors.
- Preserve typed errors and nested diagnostics for inspection and reporting.
- Treat mutation timeout as unknown commitment, including possible completion after local cancellation.
- Do not classify nonmutating timeouts or secondary cleanup timeouts as uncertain mutation outcomes.
- Retain native and browser transport payloads without imposing new generic transport bounds.

## Options and Evidence

1. Reclassify timeout alone.
   This does not prevent cleanup from replacing the timeout.
2. Add recursive `Cleanup` reason variants.
   The [iteration 0020 experiment](../iterations/0020/phase-2/transport.md) demonstrated a repair, but this requires handling diagnostic combinations as semantic alternatives.
3. Store one typed primary reason and separate supplementary errors.
   Callers can match the primary reason or use classification without inspecting diagnostics.
   The user approved this option and its one-time API migration.

## Decision

Replace `ClientError` and `SeaClientError` enums with private-field structs.
Expose `ClientErrorReason` and `SeaClientErrorReason` enums, `new`, `reason`, `additional_errors`, `with_additional_error`, and `into_parts`.
Each supplementary error retains its own primary reason and supplementary errors.
Generic-to-typed conversion retains existing transport-provided context before appending later generic diagnostics in observation order.

Preserve the initiating error when framed send, receive, or finish cleanup fails.
Promote only the primary timeout for submit, membership append, and snapshot publication, retaining supplementary errors.
Avoid repeated cleanup when the same failure propagates from framing to the author layer.
An interrupted cleanup is not complete and can be attempted again on terminal reuse.
If an author receives a service error and cleanup fails, return that service response as the primary error with cleanup attached; successful cleanup retains the existing response return.

Classification depends solely on the primary reason.
Display includes supplementary failures, while `Error::source()` retains the primary causal chain.
Supplementary failures are not causes of the initiating error.
Generic transport APIs gain no blanket `Error`, `Display`, or thread-safety bounds.

## Consequences

Rust consumers construct errors from reason enums and match `reason()` instead of the error itself.
All in-repository consumers migrate together.
Classification-based recovery and wire messages are unchanged.
Mutation timeouts remain ambiguous even when cleanup fails; callers still must reconcile rather than automatically resubmit.
Supplementary storage allocates only when errors are attached.
Cancellation-only pump shutdown and drop remain best-effort; this decision does not add a shutdown-result API.
The prior audit reports remain historical evidence of the then-deferred defect.

## Validation and Follow-Up

The [controlled deadline tests](../../crates/sea-webtransport/src/client/deadline_tests.rs) cover submit, membership append, snapshot publication, nonmutating controls, failed send/receive/finish cleanup, cleanup timeout, interrupted cleanup, terminal reuse, and no request retry.
The [typed client tests](../../crates/sea-webtransport/src/native.rs) cover nested conversion, retained payloads, classification, display, causal sources, and generic string errors.
The [client contract and migration example](../../crates/sea-webtransport/README.md#lifecycle-and-ownership) document the new API.
Validation passed for all 59 client unit tests, the migration doctest, strict workspace Clippy and rustdoc, formatting, the workspace build, documentation checks, and scoped repository policy.
The extended gate from [Development](../../DEVELOPMENT.md) also passed, including native workspace tests, generated WASM builds, TypeScript package and integration tests, benchmark correctness cases, and real Chromium transport tests.
The additional repository-root `pnpm build:fast` failed only on existing Biome formatting in [benchmark-pipelined.mjs](../../scripts/benchmark-pipelined.mjs) and [benchmark-stress.mjs](../../scripts/benchmark-stress.mjs).
Both files were verified unchanged from implementation-start commit `eddf920ac84f358575320da31178d208d74d0c7c`; they were not repaired as part of this API change.
Unattributed native connection timeouts and historical record-format limitations remain independent issues.
