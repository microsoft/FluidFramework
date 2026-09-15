# Sea client

This crate contains transport-neutral client policy for the Sea service and a small stream-backed counter helper.

`NativeClient` is an explicit state machine. Callers own transport setup, send each returned [`Request`](../sea-protocol/src/lib.rs) exactly once, and pass its response to `handle_response`. The client never reconnects or retries implicitly. A disconnect during submission or recovery preserves the stable `PendingSubmission` and enters `Ambiguous`; the caller must resolve, retry after an authoritative `not committed` result, regenerate a rejected identity, or abandon the operation. Reconnects require a session identity not previously used by that client instance.

`ContentClient` constructs blob and summary requests and validates response kinds and echoed digests. It does not perform I/O. `CounterClient` demonstrates recovery from the latest snapshot followed by subsequent append-stream records.

Run from `rust-service/`:

```bash
cargo test -p sea-client --all-targets
RUSTDOCFLAGS='-D warnings -D missing_docs' cargo doc -p sea-client --no-deps
```

The process lifecycle tests additionally require the native-service example binary and a Unix host.
