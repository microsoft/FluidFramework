# @fluid-example/inventory-app

Minimal sample demonstrating use of the SharedTree API.

<!-- markdown-magic:begin {"transform":"example-app-readme-header","serviceClient":true,"headingLevel":2} -->
<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

Complete these steps to run the example:

1. Run `corepack enable` to enable [Corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html).
2. From the `FluidFramework` root directory, run `pnpm install`.
3. From the `FluidFramework` root directory, run `pnpm run build:fast --nolint`.
   - To build only this package, add the package name to the command:
     `pnpm run build:fast --nolint @fluid-example/inventory-app`
4. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser. The app uses a session-storage-backed in-browser service by default and stores the container ID in the URL hash.
5. To select the session-backed service explicitly, run `pnpm start:session` and open <http://localhost:8080/?fluidClient=session>.
6. To share data between browser sessions, start Tinylicious in a separate terminal by running `pnpm tinylicious` in this directory, then run `pnpm start:tinylicious` and open <http://localhost:8080/?fluidClient=tinylicious>. If you use GitHub Codespaces in a browser, set the visibility of the Tinylicious port (7070) to `public`. Do not use `Private to Organization`. For instructions, read [Sharing a port](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace#sharing-a-port).
7. To use the local SEA WebAssembly service, run `pnpm start:sea-ephemeral` and open <http://localhost:8080/?fluidClient=sea-ephemeral>. No external SEA server or WebTransport connection is required; see the SEA section below for build prerequisites and remote configuration. If you use GitHub Codespaces in a browser, set the visibility of the app port (8080 by default) to `public`. Do not use `Private to Organization`. For instructions, read [Sharing a port](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace#sharing-a-port).

<!-- prettier-ignore-end -->
<!-- markdown-magic:end -->

## SEA Services

SEA is an internal, experimental service option; the application code uses the same example helpers for every service.
Build prerequisites are the pinned Rust toolchain, the `wasm32-unknown-unknown` target, and the matching wasm-bindgen CLI described in [Rust-service development](../../../rust-service/DEVELOPMENT.md).
The normal package build generates the owned WASM artifacts.

`pnpm start:sea-ephemeral` selects independent, in-browser storage without a server, certificate, or WebTransport connection.
It requires a browser supporting WebAssembly SIMD.
Its data does not survive page reload or share storage with independent windows; remove the URL hash to create a new document after reload.
Each selected client owns one lazy local service for the page lifetime, and its containers share that service.
Closing the page releases the local service; this example does not expose a service-management UI.

The remote option requires a reachable HTTPS/QUIC endpoint, a supported browser WebTransport implementation, and the SHA-256 digest of its development certificate.
From the repository root, start a local development service:

```bash
cd rust-service
sh tests/webtransport-browser/generate-cert.sh target/inventory/certs
cargo run -p sea-webtransport-server -- \
  127.0.0.1:4433 target/inventory/certs/cert.pem target/inventory/certs/key.pem \
  target/inventory/service-data
```

Start the app in another terminal with `pnpm start` from this directory.
Open `http://localhost:8080/?fluidClient=sea-webtransport&seaEndpoint=https%3A%2F%2F127.0.0.1%3A4433%2Fsea&seaCertificateHash=HASH`, replacing `HASH` with the digest printed by certificate generation.
The app adds the service-assigned document ID to the URL hash; open the complete URL in another browser window to collaborate.
Keep the service running when closing and reopening clients.
There is no fallback to local storage or WebSocket, and failures do not establish that a write did not commit.
Automatic reconnect, presence, authentication, production membership, automatic summaries, and garbage collection remain unsupported.

Select packaging at build time, without changing application code:

```bash
pnpm start --env seaPreset=split
pnpm start --env seaPreset=combined
```

Split is the default and fetches only the capability used; combined shares one memory/remote module.
The build may emit unused lazy chunks, but selecting an existing non-SEA service fetches no SEA generated bindings or WASM.
Add `seaCompression=true` to the query for a compression-enabled stack; every collaborating client must use the same setting.
The [neutral package guide](../../../rust-service/packages/sea-typescript/README.md#artifact-measurements) records artifact sizes and lower-level compressed-byte checks.

In Codespaces, ordinary HTTPS page forwarding is sufficient for local SEA.
If GitHub sign-in blocks the forwarded app in an external browser or VS Code's embedded browser, set the app port's visibility to `Public` in VS Code's Ports view, not `Private to Organization`.
Use the port on which the app is running: 8080 by default, or 8091 for the UI test server.
This is the same workaround used for Tinylicious port 7070; local SEA needs only the app port.
See [Sharing a port](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace#sharing-a-port).
Public ports are accessible without sign-in: use disposable development data and restore private visibility after testing.
Codespaces HTTPS forwarding does not establish a UDP/QUIC path for remote WebTransport.
The remote tests below ran inside the Codespace and do not prove external connectivity.

For a server-backed example through Codespaces forwarding, explicitly select `fluidClient=sea-websocket` and set `seaEndpoint` to the server's forwarded `wss://HOST/sea/websocket` URL.
Start the server with the optional [WebSocket listener](../../../rust-service/crates/sea-webtransport-server/README.md#optional-websocket-listener), configure its exact backend-visible Origin allowlist, and make both the app and server ports public for disposable development testing.
This selection uses the separate WebSocket artifact, requires no certificate hash, and does not support `seaCompression=true`.
It does not change `sea-webtransport` or provide an implicit fallback.
On 2026-09-19, the Windows VS Code embedded browser created a server-backed document through public app and SEA ports, incremented a quantity, and retained the edit after reload.

## Testing

```bash
npm run test
```

Run the retained inventory UI matrix with Playwright:

```bash
pnpm test:playwright
```

The runner starts a split-preset development server on port 8091 unless an existing server is available.
Install Playwright's Chromium or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a compatible installed browser.
Set `INVENTORY_TEST_TINYLICIOUS=1` when Tinylicious is running on port 7070.
Set `SEA_WEBTRANSPORT_URL` and `SEA_CERTIFICATE_HASH` when the SEA listener is running.
Absent remote services are reported as skipped, not passed.
To test combined packaging, set `SEA_LOADER_PRESET=combined` and restart the development server with `--env seaPreset=combined`.
When reusing a server, its build-time preset must match the test setting; artifact assertions detect a mismatch.
`INVENTORY_TEST_URL` selects an already-running app on another port.

On 2026-09-19, Chromium 152 on Debian 13 inside Codespaces passed all eight UI cases under each preset: default, unknown-value fallback, TypeScript ephemeral, TypeScript session, SEA ephemeral, Tinylicious, and plain/compressed SEA WebTransport.
Tests use actual add, remove, and quantity controls; default/session reload retains edits.
Remote cases exchange edits in both directions, converge after concurrent edits to distinct quantities, close both independent browser contexts, and reopen in a third context.
Non-SEA cases fetch no SEA artifacts; remote SEA fetches exactly one selected generated JS chunk and one WASM asset.
Desktop and 390-pixel mobile screenshots preserve the existing UI without overlapping controls.
The existing missing favicon produces a 404 recorded separately from application console errors; no other console errors were observed in the remote matrix.
On the same date, VS Code's embedded browser on Windows (Electron 42.10.0, Chromium 148) loaded local SEA through the public forwarded app port after the Codespaces development-port confirmation.
It fetched one split memory binding and one WASM asset, created a document, and passed add, increment, and remove checks using DOM-dispatched button clicks.
Pointer automation stalled in the embedded tab, which initially reported a zero-sized viewport, so this was a functional check, not an external visual acceptance pass.
The webpack development hot-reload socket timed out on the forwarded hostname with port 8091; local SEA continued to work without it.
The app port was restored to private after testing.
Server-restart persistence was not tested.

The test runner closes its browser contexts and any development server it starts.
Stop separately started Tinylicious and SEA listeners with Ctrl+C after testing; generated credentials and SEA data under `rust-service/target/` are ignored and must not be committed.

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- markdown-magic:begin {"transform":"readme-footer","headingLevel":2} -->
<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

- Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
- [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
- Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
- [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [repo documentation](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact <opencode@microsoft.com>.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->
<!-- markdown-magic:end -->
