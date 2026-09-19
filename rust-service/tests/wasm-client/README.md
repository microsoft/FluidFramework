# Sea WASM Node validation

The Node command runs the neutral package's session tests directly.
General session scenarios live in [sea-typescript's test suite](../../packages/sea-typescript/test/session.test.mjs) and import its capability entrypoints.
They cover submission resolution, backlog and live delivery, pending-read cancellation, recursive content, idempotent snapshots, publication authority, conflicting operations, superseded and reused memberships, explicit reopening, and backend-assigned document identities.

The snapshot-registration ownership regression now uses neutral sessions: replacement ends the old pending read, cancelling the old registration cannot revoke its replacement, and cancelling the current registration revokes publication authority.
The sequencer also retains its focused registration-replacement regression in `src/session.rs`.
The optional injected JavaScript disconnect hook and named-create flag tests were retired with those obsolete APIs.
The current browser transport implements disconnection directly, and the neutral factory allocates document identities only when the caller omits the document.

Build the package-owned artifacts and run the tests from `rust-service/`:

```bash
pnpm exec fluid-build packages/sea-typescript --task test
```

The package task builds its artifacts and consumer type assertions before executing its Node tests; it does not depend on the Fluid harness.
After building, `node --test packages/sea-typescript/test/session.test.mjs` runs the session tests directly.
Session consumers use `@fluidframework/sea-typescript`, which owns the shared `sea-wasm` artifacts.
Generated bindings and WASM binaries are ignored build outputs.

The package's `websocket.test.mjs` retains focused low-level socket queue, upload-throttling, FIN, cancellation, handshake, and ownership regressions against the separate socket-capable artifact.
These tests exercise transport mechanics, not the removed injected-session API.
The browser harness enables its optional real Node collaboration test with `SEA_NODE_WEBSOCKET=1`; the test uses the neutral package's `openRemote` entrypoint.
