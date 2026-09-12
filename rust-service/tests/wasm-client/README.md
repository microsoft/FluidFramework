# WASM client package validation

The `fluid-webtransport-browser` crate generates one TypeScript-facing WASM package with two clients:

- `InjectedClient` is environment-neutral. Its `AsyncRequestTransport.request` method receives a validated complete FSP4 request and returns a promise for a complete FSP4 response. The WASM core validates response framing and request identity and owns bounded request/lifecycle state.
- `BrowserClient` retains the browser WebTransport adapter, certificate pinning, stream I/O, explicit disconnect, and explicit reconnect behavior.

Both clients expose the same additive projected-read, ambiguity-recovery, and content operations:

- `readProjected(document, after?)` returns a `ProjectedReadPage` containing accepted operations, an opaque resume cursor, and `hasMore`. Initial references are represented by an absent reference value; non-initial references and cursors remain opaque byte arrays.
- `resolveSubmission(document, writer, session, submission)` returns a `SubmissionResolution` with kind `committed`, `notCommitted`, or `stillUncertain`. Resolution never retries or resubmits work; any retry after `notCommitted` remains an explicit caller action.
- `uploadBlob(payload)` returns a `BlobUpload` receipt containing the SHA-256 digest, persisted size, and deduplication status.
- `fetchBlob(digest)` returns the bounded blob bytes after WASM validates the response's echoed 32-byte digest.
- `publishSummary(entries)` accepts a `ReadonlyArray<SummaryEntry>` and returns a `SummaryPublication` receipt containing the digest, entry count, persisted bytes, and deduplication status.
- `fetchSummary(digest)` returns a `ReadonlyArray<SummaryEntry>` after WASM validates the response's echoed digest. Summary paths and blob identities remain byte arrays; UTF-8 and canonical-path validation belongs to the native service.

All four content operations use the existing one-request queue and configured FSP4 frame bound. They do not retry, reconnect, or buffer additional requests.

Build and test the Node distribution from `rust-service/` with an isolated target:

```bash
CARGO_TARGET_DIR=/tmp/fluid-wasm-client-target \
  RUSTFLAGS='--cfg=web_sys_unstable_apis' \
  cargo build --locked -p fluid-webtransport-browser --target wasm32-unknown-unknown --release
wasm-bindgen /tmp/fluid-wasm-client-target/wasm32-unknown-unknown/release/fluid_webtransport_browser.wasm \
  --target nodejs --out-name fluid_webtransport_browser --out-dir tests/wasm-client/pkg
node --test tests/wasm-client/node-test.mjs
```

The generated `pkg/` bindings, declarations, and WASM binary are ignored validation artifacts. Release automation may publish equivalent generated browser and Node distributions, but generated output is not committed.