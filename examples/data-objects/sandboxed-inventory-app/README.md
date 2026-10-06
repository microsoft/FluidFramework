# @fluid-example/sandboxed-inventory-app

An example of using the SharedTree sandboxing APIs to edit one inventory from a Host page and an isolated Guest iframe.

> **Implementation status: page scaffold.**
> You can run separate Host and Guest pages, with the Guest isolated in an opaque-origin iframe.
> Inventory data, Fluid connections, sandbox synchronization, status reporting, and restart are not implemented yet.
> The intended behavior and acceptance criteria below remain implementation guidance.

## Run the scaffold

From the repository root:

```bash
corepack enable
pnpm install
pnpm run build:fast --nolint @fluid-example/sandboxed-inventory-app
```

Then run the example:

```bash
cd examples/data-objects/sandboxed-inventory-app
pnpm start
```

Open <http://localhost:8080>.
You should see Host and Guest panes side by side.
The Guest heading inside the iframe is rendered by its separate bundle, not by the Host.
Both pages explicitly state that tree synchronization is not implemented yet.
No Fluid service is needed for this scaffold, and service-selection query parameters do not yet affect it.

The development server disables hot module replacement and live reload so they cannot replace a Guest outside application-managed teardown.
Refresh the top-level page after changing the code.

### Build and test

After building, run these commands from this directory:

```bash
# Run the Mocha/jsdom unit tests.
pnpm test:mocha

# Install Chromium once, then run the limited browser suite.
pnpm exec playwright install chromium
pnpm test:playwright

# Run both suites.
pnpm test

# Type-check the browser tests, lint, and check formatting.
pnpm check:types:test:playwright
pnpm eslint
pnpm check:format

# Build optimized pages and bundles into dist/.
pnpm webpack
```

After source or unit-test changes, rebuild with `pnpm build:esm` followed by `pnpm build:test:esm` before running Mocha.
Playwright starts and stops its own development server.
The current tests cover page rendering in both React Strict Mode settings, the iframe configuration, and actual browser isolation.
They do not yet cover tree synchronization or lifecycle controls.

### Page build and cross-origin script loading

[webpack.config.cjs](./webpack.config.cjs) generates separate HTML pages with only their respective entry bundle:
[src/index.tsx](./src/index.tsx) for the Host and [src/guest.tsx](./src/guest.tsx) for the Guest.
Both use [src/page.ejs](./src/page.ejs) as their HTML template.
The Guest entry point does not import container-loading or service-client utilities.

The opaque-origin Guest loads its bundle as a module using cross-origin resource sharing (CORS).
The development server permits anonymous cross-origin access to `/guest.bundle.js` only, using `Access-Control-Allow-Origin: *`.
It does not disable host/origin checks for other routes or add `allow-same-origin` to the iframe.
If you serve the production output yourself, configure the same CORS response header for the Guest bundle.

## Purpose and scope

You will use two editable inventory views displayed side by side:

- **Host:** The application-owned tree view connected to Fluid services.
- **Guest:** An independent tree view inside an iframe, synchronized with the Host through a `MessagePort`.

The example will adapt the schema and interactions from [inventory-app](../inventory-app/README.md) without changing that example.
Both pages will compile the same schema and React components into separate JavaScript contexts.
The Guest will not load a Fluid container or connect to Fluid services.

This example will focus on initialization, editing, errors, and session replacement.
It will not include blob handling, undo/redo controls, or a protocol-message log.

## Intended usage

### Service selection

The Host will use the existing example service-selection and container-loading conventions:

- Use the session-storage-backed service by default, or select it with `?fluidClient=session`.
- Use `?fluidClient=tinylicious` with a running Tinylicious service to collaborate across browser sessions.
- Store the container ID in the Host page's URL hash.
  A missing ID creates a new document; an existing ID loads that document.

The Host must explicitly configure `oldestSupportedClient: "3.4.0"` or later.
Sandboxing requires the ID compressor's V3 serialization format.
This example will not change the shared example helper's default compatibility setting.
The Host and Guest will use the same version of the tree package.

### Editing walkthrough

Once the application is implemented:

1. Open the Host page.
   A new document starts with `nut` and `bolt`, each with quantity `0`.
2. Wait for the Guest status to change from **Connecting** to **Connected**.
   Both panes should display the same inventory.
3. Increment a quantity in the Host pane.
   The Host changes immediately, and the Guest receives the change asynchronously.
4. Edit a quantity in the Guest pane.
   The Guest changes immediately, and the Host receives the change asynchronously.
5. Add and remove parts from either pane.
   Both views should converge after their messages are processed.
6. Select **Restart Guest**.
   The Host view and container remain in place while a new Guest loads the current Host state.

Display this warning beside the restart control:

> Restart Guest does not wait for pending edits. Guest edits not yet received by the Host may be lost.

Restart is not rollback.
A Guest change that the Host already accepted remains in the Host, even if its acknowledgment never reached the Guest.

## Architecture

```text
Fluid services
      |
Host page
  Application-owned inventory TreeView
  Host inventory UI
  Sandboxing.Host
      |
      | MessageChannel: tree synchronization
      |
Guest iframe: sandbox="allow-scripts"
  Sandboxing.Guest
  Independent inventory TreeView
  Guest inventory UI
```

Use the exported alpha [Sandboxing API](../../../packages/dds/tree/src/sandboxing/sandboxing.ts), not its implementation classes or test helpers.
The API synchronizes trees across an existing boundary; the application creates the iframe and its browser isolation.

The iframe must use `sandbox="allow-scripts"` without `allow-same-origin`.
This gives the Guest an opaque origin, even when its HTML and scripts are served from the same server as the Host.
Neither page reads the other's DOM or passes live tree objects across the boundary.

### Bootstrap contract

Application bootstrap messages and tree synchronization messages have separate responsibilities:

1. The Host installs its bootstrap listener before loading the iframe and assigns a fresh identifier to the session attempt.
2. The Guest reports readiness through `window.postMessage`.
   The Host validates the message shape, current iframe window, origin, and session identifier.
3. The Host creates a `MessageChannel` and calls `Sandboxing.createHost` with its application-owned view and one port.
4. The Host transfers the other port to the current Guest window.
   An opaque-origin recipient requires `"*"` as the target origin.
   Do not use this requirement as a reason to accept arbitrary senders.
5. The Guest validates the expected parent window, parent origin, session identifier, and transferred port.
   It calls `Sandboxing.createGuest` with `FormatValidatorBasic`, creates a view with the inventory configuration, and renders it.
6. The Guest reports successful initialization.
   The Host displays **Connected** only after the Guest view is ready.

The `"null"` origin reported by an opaque-origin Guest does not uniquely identify that Guest.
Only validated messages from the expected window and current session may advance initialization or change its status.
Duplicate initialization, unexpected ports, and stale messages must not create extra endpoints or replace a newer session.
Close unused transferred ports.

Keep readiness, port transfer, and status messages outside the port owned by the tree protocol.
Do not extend or wrap tree protocol messages to add application controls.

### Status and failure contract

| State | Meaning | Expected behavior |
| --- | --- | --- |
| Connecting | The Guest has not completed initialization. | Show progress and enforce a bounded startup timeout. The Host remains editable once its own view is ready. |
| Connected | The Guest has initialized its view and can synchronize edits. | Enable Guest editing. This state does not claim that all edits have been sequenced by Fluid services. |
| Error | Guest loading, initialization, or synchronization failed. | Show the error, stop Guest editing, release the failed session's resources, and allow replacement when the Host view remains usable. |

Handle initial Host/container loading errors separately from Guest errors.
If no usable Host view exists, report the startup failure instead of offering Guest restart as a remedy.

Supply `handleProtocolError` on both sandbox endpoints.
Treat a reported protocol or synchronization error as terminal for that session; do not reset and reuse the failed endpoints.
Reject or handle pending asynchronous work explicitly rather than leaving unhandled rejections.
Late initialization completions and failure callbacks from an old session must not change the replacement session's state.

Guest startup failure must not dispose the application-owned Host view.
The sandbox APIs do not yet guarantee isolation of every main-tree merge failure.
If the underlying Host tree becomes unusable, report that failure rather than claiming a Guest restart repaired it.

### Ownership and restart contract

The Host application owns the container and its inventory view.
Each sandbox session owns its Host endpoint, Guest iframe, channel, bootstrap listeners, and startup timer.
The Guest owns its endpoint, independent tree views, and React root within its iframe.

For an immediate restart:

1. Mark the old session as inactive so late callbacks cannot affect the UI.
2. Remove the old iframe to stop Guest execution before disposing its Host endpoint and reclaiming the Guest's ID space shard.
3. Release the old Host endpoint, listeners, timers, and any ports not already owned and closed by an endpoint.
4. Create a new iframe, channel, and Host/Guest pair using the retained application-owned view.

Do not wait for pending Guest edits, a shutdown acknowledgment, or an iframe unload handler.
Use `Guest.dispose()` for explicit Guest-side cleanup when that context is still available, but do not depend on it running during iframe removal.
Guest disposal alone does not notify or dispose the Host.

Cleanup must be idempotent and work after partial initialization.
Do not allow overlapping restart operations to leave multiple active sessions.
Host edits made while the Guest is being replaced must be included in initialization or subsequent updates to the new Guest.

### Acknowledgment semantics

`Guest.updateHostPromise` waits for the Host to acknowledge pending Guest changes.
`Host.updateGuestPromise` waits for the Guest to acknowledge pending Host updates.
Both may be `undefined` when there is no pending work.
An existing pending promise also covers additional changes made while it remains pending.

Neither promise guarantees Fluid-service sequencing, durable storage, or convergence with every collaborating client.
Pending acknowledgment promises reject when their session fails or is disposed.
A rejection does not prove that the corresponding edits were never applied.

## Acceptance criteria and test strategy

The following are planned tests, not claims of existing coverage.
Most behavior will be tested with Mocha, adding jsdom and React testing utilities where DOM behavior is involved.
Pure validation and lifecycle logic should not require a real browser.

| Case | Expected result | Primary test layer |
| --- | --- | --- |
| Inventory model | New documents contain the initial parts; quantity edits, insertion, and removal update the model. | Mocha |
| Inventory UI | Controls edit the intended nodes, tree observations update the display, and both panes have clear labels. | Mocha + jsdom |
| Status UI | Connecting, Connected, Error, and the restart warning render correctly; failed Guest views cannot be edited through the UI. | Mocha + jsdom |
| Bootstrap validation | Invalid senders, origins, sessions, message shapes, duplicate initialization, and unexpected ports cannot advance the session. | Mocha |
| Startup failure | Initialization rejection and timeout become visible errors, release partial resources, and leave an otherwise usable Host view intact. | Mocha, with jsdom for UI assertions |
| Restart ordering | The old iframe stops before Host disposal; new endpoints are created without waiting for Guest acknowledgment. | Mocha |
| Host lifetime | Restart preserves the application-owned view and accepted edits; Host edits made during replacement reach the new Guest. | Mocha with an in-process integration case where needed |
| Repeated restart | Cleanup is idempotent; old callbacks and messages cannot update the new session or create duplicate endpoints. | Mocha |
| Resource cleanup | Success, failure, and partial initialization release their owned listeners, timers, ports, and session resources on teardown. | Mocha |
| Editing across endpoints | Representative changes propagate in both directions, and interleaved changes converge using real sandbox endpoints and message channels. | Focused in-process Mocha integration |

Use a limited Playwright suite for the browser-only guarantees:

1. Load the real Host and Guest bundles, transfer a port into the iframe, and propagate representative edits in both directions.
2. Verify both the intended sandbox flags and actual denial of Guest access to the parent DOM and storage.
3. Replace the real iframe, preserve accepted Host edits, and resume synchronization without stale updates or unexpected page errors.
4. Load the production build and initialize its opaque-origin Guest.

Checking an iframe attribute in jsdom is not evidence that browser isolation works.
Where jsdom cannot faithfully model a behavior, document the limitation and add only the necessary browser coverage.
Do not duplicate the tree package's comprehensive protocol tests or replay every unit-test case through Playwright.

Use controlled timers where appropriate and bounded, condition-based waits rather than arbitrary sleeps.
Tests must clean up their own DOM roots, sessions, channels, listeners, and timers.
Do not require every unacknowledged edit to be lost on restart: an edit may already have reached the Host.

## Development workflow

Follow the [Coding Guidelines](../../../docs/content/Guidelines/Coding-Guidelines.md) for implementation and test code.
Follow the [Documentation Guidelines](../../../docs/content/Guidelines/Documentation-Guidelines.md), including their linked guides, for this README and source-code documentation.

For each behavior, document its contract, write a focused failing test, confirm the expected failure, implement the behavior, and refactor with tests passing.
Keep the documentation aligned with implemented behavior throughout development.
The scaffold has executable unit and browser tests.
Add the remaining behavior tests with each subsequent feature, rather than postponing them until the application is complete.

Before considering the example complete, validate its type-check/build, lint/format checks, Mocha suite, limited Playwright suite, production bundle, and Tinylicious startup.
Keep the runnable commands above up to date as those features are added.

## Limitations

Browser-enforced iframe isolation and tree protocol hardening are separate concerns.
This example must not be presented as production-safe hosting for arbitrary untrusted Guest code.
See the [sandboxing design notes](../../../packages/dds/tree/src/sandboxing/sandboxing.md#remaining-work-before-production) for the current validation, resource-limit, and fault-isolation work that remains.
