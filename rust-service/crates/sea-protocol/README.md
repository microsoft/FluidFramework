# Fluid Service Protocol

`sea-protocol` defines FSP4, the bounded binary request/response protocol used by the native Fluid service. It contains transport-neutral frame types and deterministic encode/decode functions; it does not perform I/O or own service state.

## Frame contract

Each buffer contains exactly one frame:

- four-byte `FSP4` magic;
- the `VERSION` value;
- a stable request or response kind;
- reserved bits, which must be zero;
- a caller-assigned request identifier;
- the declared body length; and
- one complete encoded message body.

`decode` rejects unsupported versions, malformed discriminants, truncation, trailing bytes, empty required fields, and values beyond the supplied `Limits`. Message kinds, enum discriminants, field order, and field encodings are wire compatibility boundaries.

## Requests and responses

Document requests cover creation, session opening, submission, canonical and projected reads, submission resolution, snapshots, and transport-managed streams. Content requests upload and fetch blobs or publish and fetch summary manifests. `Response::Error` carries a stable `ErrorCode`; clients should treat `Ambiguous` and `RecoveryRequired` as recovery signals rather than ordinary rejection.

Positions, identities, digests, and payloads remain opaque byte strings at this layer. The protocol enforces shape and size while the sequencer and service enforce their semantics.

## Validation

From `rust-service/`:

```bash
cargo test -p sea-protocol
cargo rustc -p sea-protocol --lib -- -D missing-docs
RUSTDOCFLAGS="-D warnings" cargo doc -p sea-protocol --all-features --no-deps
```

The unit tests pin fixture bytes and additive message kinds, round-trip every request and response family, and exercise bounds, malformed frames, truncation, and trailing-byte rejection.
