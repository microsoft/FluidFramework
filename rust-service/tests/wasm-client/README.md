# Sea WASM Node Validation

The Node command runs the neutral package's session tests directly.
General session scenarios live in [sea-typescript's test suite](../../packages/sea-typescript/src/test/session.spec.ts) and exercise its capability factories.
They cover ordered submission, backlog/live delivery, cancellation, recursive content, snapshots, publication authority, membership replacement, reopening, and document allocation.

Snapshot-registration tests require replacement to end the old pending read, old cancellation to leave the replacement intact, and current cancellation to revoke publication authority.

Build the package-owned artifacts and run the tests from `rust-service/`:

```bash
pnpm exec fluid-build packages/sea-typescript --task test:mocha:esm
```

The package task builds its artifacts, consumer type assertions, and TypeScript Mocha suites before executing the tests with shared Fluid setup; it does not depend on the Fluid harness.
After building, `MOCHA_SPEC=lib/test/session.spec.js pnpm --dir packages/sea-typescript test` runs the session suite directly.
Session consumers use `@fluidframework/sea-typescript`, which owns the shared `sea-wasm` artifacts.
Generated bindings and WASM binaries are ignored build outputs.

The package's [websocket.spec.ts](../../packages/sea-typescript/src/test/websocket.spec.ts) retains focused low-level socket queue, upload-throttling, FIN, cancellation, handshake, and ownership regressions against the separate socket-capable artifact.
The [browser harness](../webtransport-browser/README.md) supplies a listener for the optional real Node `openRemote` test during all-mode and socket-mode runs.
