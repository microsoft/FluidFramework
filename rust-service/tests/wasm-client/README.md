# Sea WASM Node validation

The Node command runs the neutral package's session tests and three retained legacy binding regressions.
General session scenarios live in [sea-typescript's test suite](../../packages/sea-typescript/test/session.test.mjs) and import its capability entrypoints.
They cover submission resolution, backlog and live delivery, pending-read cancellation, recursive content, idempotent snapshots, publication authority, conflicting operations, superseded and reused memberships, explicit reopening, and backend-assigned document identities.

The remaining direct generated imports test contracts specific to the old binding surface:

- An injected transport may omit its disconnect hook; an implemented hook's failure propagates.
- The legacy named-create flag is rejected rather than reopening an existing archive.
- Replacing snapshot registration cancels its old pending read, and cancelling the old registration does not revoke the replacement.

These tests remain until the legacy surface is removed or their transport responsibilities have a replacement home.
The neutral API has no named-create flag and does not implicitly replace a caller-owned snapshot stream.
Do not add new general session tests to the legacy surface.

Build both package-owned and legacy distributions and run the tests from `rust-service/`:

```bash
pnpm exec fluid-build tests/minimal-fluid-driver --task test:wasm
```

The harness declares the neutral package build as a dependency and imports its tests only for orchestration; the neutral package does not depend on the harness.
After building, `node tests/wasm-client/node-test.mjs` runs all fifteen Node tests directly.
Legacy artifacts remain under `crates/sea-webtransport/pkg/` and `crates/sea-webtransport/test-support/pkg/`.
New session consumers use `@fluidframework/sea-typescript`, which owns the shared `sea-wasm` artifacts.
Generated bindings and WASM binaries are ignored build outputs.