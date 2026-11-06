# @fluid-example/text-editor-sea

Minimal sample demonstrating direct SharedTree integration with the SEA Rust service and Quill.
Unlike `@fluid-example/text-editor`, this app does not use a Fluid container or select between service clients.
It connects each simulated user directly through `@fluidframework/sea-tree` to the SEA WebSocket server on port 8081.
The app uses `ws://localhost:8081/sea/websocket` locally and derives the corresponding secure forwarded URL when it runs in GitHub Codespaces.
Direct clients explicitly request up to 256 additional snapshot content items, including descendant blobs.
The driver consumes this content alongside event delivery and retains it in a bounded cache; missing or evicted items load on demand.

## Getting Started

Complete these steps to run the example:

1. Run `corepack enable` to enable Corepack.
2. From the `FluidFramework` root directory, run `pnpm install`.
3. From the `FluidFramework` root directory, run `pnpm run build:fast --nolint @fluid-example/text-editor-sea`.
4. Start the SEA server with its WebSocket listener on port 8081 and allow the `http://localhost:8082` origin.
5. Run `pnpm exec webpack serve --config webpack.config.cjs --port 8082` from this directory and open <http://localhost:8082> in a web browser.

The app creates a new SEA document when it starts and demonstrates collaboration between the simulated users on that page.
It writes the SEA document ID to the URL hash.
Open that URL in another browser or send it to another collaborator to connect direct SharedTree clients to the same document.

## Summaries and connection recovery

Each user panel shows connection state, pending edits, and the number of summaries that client has published.
The SEA-nominated client summarizes acknowledged state after 100 application operations or five seconds of inactivity.
Reopening a document loads the latest summary and applies newer operations.
The panel indicates when it loaded a summary.
Loading does not download operations before that summary.
The editor uses its schema annotations to reuse unchanged plain-text and formatted-text regions in incremental summaries.
Only new blobs and explicitly represented directories are uploaded; each snapshot root still describes the complete document.
The current direct snapshot format is version 3.
Version 2 full snapshots load normally and establish a new incremental baseline on the next summary.
Version 1 experimental snapshots are rejected; remove the URL hash and reload to create a fresh document for those snapshots.
Update all clients before editing a document with version 3 summaries.

Use **Disconnect** to pause one simulated user, edit both that user and a connected peer, then use **Reconnect**.
The existing view is retained while pending edits are reconciled and rebased.
Unexpected connection loss triggers automatic reconnect.
Errors are displayed rather than leaving an apparently connected editor.
Pending edits exist only in the current tab: do not reload or close it until the pending count reaches zero.

When forwarding the app to a different local port, also forward server port 8081 and add the browser's exact origin to `SEA_WEBSOCKET_ORIGINS`.
For example, an app opened at `http://localhost:8083` requires that origin even when its remote development server listens on port 8082.

## Testing

Run the in-memory React component tests with Mocha:

```bash
pnpm test:mocha
```

Run the direct SEA browser tests with Playwright:

```bash
pnpm test:playwright
```

Playwright starts the webpack development server on port 8082.
The tests require the SEA WebSocket server to be running on port 8081 and to allow the `http://localhost:8082` origin.
They cover two-page collaboration, full and incremental rich-text summary reload, explicit disconnect/reconnect, and real WebSocket loss with edits made during the outage.
