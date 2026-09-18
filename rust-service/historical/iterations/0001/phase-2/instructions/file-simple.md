# Iteration 0001: file-simple Instructions

Status: active
Branch: `rust-service/iteration-0001/file-simple`
Base commit: `59f5069b43a6f2ede193f5affa8cda3a267628ff`
Owner: GitHub Copilot minimal file agent
Report: `rust-service/iterations/0001/phase-2/file-simple.md`

## Assignment

Test whether an understandable length-framed append-only file using ordinary buffered I/O can implement the existing traits, preserve positions across clean reopen, and fail clearly on incomplete or invalid data. The hypothesis excludes checksums, `fsync`, atomic metadata, torn-write repair, retention, and crash-durability claims.

## Ownership

Writable: `rust-service/crates/file-simple/` and this workstream report. Read-only: core, conformance, memory, workspace files, and decisions. Do not add shared dependencies or modify traits/conformance; report any required shared change.

## Expected Evidence

Deliver an `AppendStream` and `SnapshotStore`, documented buffered durability, applicable shared conformance, clean-close reopen tests, malformed header/payload tests, persisted-byte and source/dependency measurements, and format notes. Stop when these pass without crash-safety mechanisms.

## Validation

- `cargo test -p snapshotted-stream-file-simple --all-features`
- `cargo clippy -p snapshotted-stream-file-simple --all-targets --all-features -- -D warnings`
- `cargo test --workspace --all-targets --all-features` after integration

## Escalation and Stopping Conditions

Escalate shared API or conformance changes, inability to map persisted positions without exposing offsets, or snapshot publication requiring atomicity beyond scope. Stop rather than adding recovery repair or durability machinery. A clear unsupported conformance capability with evidence is useful.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
