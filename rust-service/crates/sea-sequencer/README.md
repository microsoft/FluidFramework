# Fluid Sequencer

`sea-sequencer` provides authoritative ordering and validation for Fluid submissions over an opaque append-only storage implementation. It stores only valid session-start and accepted-submission entries in the canonical log.

## Session and submission model

A stable `WriterId` owns one current `SessionId`. Reconnects use a fresh session identity. Each operation carries a stable `SubmissionId`, a contiguous writer-local sequence number, and a canonical reference position.

Validation runs while the current fence is held and before append. The sequencer rejects reused sessions, unknown writers, stale sessions or references, sequence duplicates and gaps, future references, and conflicting reuse of a submission identity. An exact retry returns `SubmitOutcome::Duplicate` without appending another entry.

Storage failures classified as ambiguous put the sequencer into recovery-required state. Replay determines whether the stable submission identity committed before another append is allowed. Session-start ambiguity follows the same replay-first rule.

## Storage and fencing

`SequencerStorage` is the finite-read and append boundary. `KernelStream` adapts an `AppendStream` plus `PositionCodec`. `FencedStream` keeps fence validation, replay, validation, and append under one service-owned gate.

`FencedStream::new` provides process-local fencing. `FencedStream::with_deployment_authority` adds a same-host locked epoch file; all competing processes must use the same authority path and storage resource. This is not a distributed consensus or multi-host lease.

## Projected reads

`read_projected` filters administrative session entries while advancing an opaque canonical cursor across every scanned record. Pages are bounded by canonical record count and encoded operation bytes, and never skip the first operation solely because it exceeds the byte target.

## Validation

From `rust-service/`:

```bash
cargo test -p sea-sequencer
cargo rustc -p sea-sequencer --lib -- -D missing-docs
RUSTDOCFLAGS="-D warnings" cargo doc -p sea-sequencer --all-features --no-deps
```

Tests cover pre-append rejection, exact retries, ambiguous committed and uncommitted outcomes, replay, stale fences, same-host deployment fencing, and bounded projected pagination.
