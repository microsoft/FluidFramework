# Iteration 0004: encryption-wrapper Instructions

Status: planned
Branch: `rust-service-iteration-0004-encryption-wrapper`
Iteration source commit: `a577eda313ebe68f6e8ba3e33e99ea0822a50d9a`
Owner: GitHub Copilot encryption-wrapper coding agent
Report: `rust-service/iterations/0004/phase-2/encryption-wrapper.md`

## Assignment

Add a transparent authenticated-encryption wrapper for records and snapshots with a versioned envelope, key identity, nonce generation, associated data, and rotation boundary. Hypothesis: a reviewed misuse-resistant AEAD with injected key resolution/nonce generation preserves shared semantics without kernel changes. Disprove with conformance, wrong-key, rotation, corruption, and nonce-reuse-fixture tests. Key distribution, authorization, metadata/traffic confidentiality, and production secret storage are excluded.

## Ownership

- Independent Wave 1 workstream.
- Writable: new `rust-service/crates/wrappers/encryption/` and `rust-service/iterations/0004/phase-2/encryption-wrapper.md`.
- Core, conformance, compression, storage, and transport crates are read-only. Composition tests live in the new crate; compression is inside encryption.
- Use reviewed RustCrypto primitives supported by Rust 1.98.1; never implement cryptography or expose key bytes.
- Do not commit root workspace membership or lockfile; validate dependencies in a disposable exact copy.

## Expected Evidence

- Authenticated version/algorithm/key-ID/nonce/context metadata, production secure nonce source, and injected deterministic test source.
- Direct shared conformance; empty/large record, snapshot, wrong-key, rotation, clone/reopen, truncation/bit-flip, and compression-inside-encryption tests.
- Corruption errors reveal no authentication oracle detail; unavailable key material is distinguishable without leaking keys.
- Report threat boundary, dependency audit, envelope overhead, failures, and commits.

## Validation

Print checkout identity. In a disposable exact copy with temporary registration, run focused tests with captured corruption cases, direct conformance, strict Clippy, rustfmt, and dependency license/advisory inspection using an isolated target directory. Verify no assigned-worktree root manifest/lockfile diff and report exact dependency versions/features.

## Escalation and Stopping Conditions

Stop on nonce-safety uncertainty, custom/unaudited cryptography, plaintext/key leakage, ambiguous corruption handling, or required kernel changes. Preserve the smallest failing envelope and do not weaken tests to proceed.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
