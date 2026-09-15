# Iteration 0004: encryption-wrapper Instructions

Derived from iteration: 0003
Status: planned
Owner: GitHub Copilot encryption-wrapper coding agent

## Approved Scope

Add a transparent authenticated-encryption wrapper for record and snapshot payloads. Define a versioned envelope, key identity, nonce generation, associated data, wrong-key behavior, and rotation boundary. The user approved adding encryption now in the [iteration 0003 Phase 3 report](../phase-3-report.md#next-iteration-scope). Key distribution, user identity, authorization, metadata/traffic confidentiality, searchable encryption, and production secret storage are excluded.

## Prior Evidence

The accepted kernel treats payloads as immutable bytes and the existing [compression wrapper](../../../crates/wrappers/compression/src/lib.rs) proves transparent record/snapshot composition and shared conformance. Encryption can therefore remain outside the kernel. Compression must be inside encryption; do not adapt one compression context across secrets and attacker-controlled input.

## Hypothesis and Discriminating Check

Hypothesis: a misuse-resistant AEAD envelope with injected key resolution and nonce generation can preserve append boundaries, positions, snapshots, capabilities, and stable errors without kernel changes. The cheapest disproof is direct shared conformance plus bit-flip, truncation, nonce-reuse-fixture, wrong-key, key-rotation, and encrypted-snapshot recovery tests.

## Ownership and Dependencies

- Wave 1, independent of service assembly.
- Writable: new `rust-service/crates/wrappers/encryption/` and the eventual iteration `0004` encryption report.
- Prefer a reviewed RustCrypto misuse-resistant AEAD supported by Rust 1.98.1. Never implement cryptographic primitives. Keep keys out of logs, snapshots, errors, test output, and repository files.
- Core, conformance, compression, storage, and transport crates are read-only. Add composition tests in the new crate.
- Crate-local manifests may change; do not commit the shared lockfile or root member list. Report exact dependency versions/features for integration.

## Deliverables and Validation

- Version and authenticate algorithm/key ID/nonce/context metadata; use a cryptographically secure nonce source in production and an injected deterministic source only in tests.
- Classify malformed/authentication failures as corrupt without exposing oracle detail; distinguish unavailable key material without leaking key contents.
- Pass direct shared conformance and tests for empty/large payloads, snapshots, all envelope corruptions sampled exhaustively by byte/bit class, wrong key, rotation, clone/reopen, and compression-inside-encryption composition.
- Run focused tests, strict Clippy, rustfmt, and dependency-license/advisory inspection with an isolated target directory.
- Stop on nonce-safety uncertainty, unaudited crypto, plaintext leakage, or any need to alter kernel semantics.
