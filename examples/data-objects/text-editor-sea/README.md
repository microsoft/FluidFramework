# @fluid-example/text-editor-sea

Minimal sample demonstrating direct SharedTree integration with the SEA Rust service and Quill.
Unlike `@fluid-example/text-editor`, this app does not use a Fluid container or select between service clients.
It connects each simulated user directly through `@fluidframework/sea-tree` to the SEA WebSocket server on port 8081.
The app uses `ws://localhost:8081/sea/websocket` locally and derives the corresponding secure forwarded URL when it runs in GitHub Codespaces.

## Getting Started

Complete these steps to run the example:

1. Run `corepack enable` to enable Corepack.
2. From the `FluidFramework` root directory, run `pnpm install`.
3. From the `FluidFramework` root directory, run `pnpm run build:fast --nolint @fluid-example/text-editor-sea`.
4. Start the SEA server with its WebSocket listener on port 8081 and allow the `http://localhost:8082` origin.
5. Run `pnpm start -- --port 8082` from this directory and open <http://localhost:8082> in a web browser.

The app creates a new SEA document when it starts and demonstrates collaboration between the simulated users on that page.
It writes the SEA document ID to the URL hash.
Open that URL in another browser or send it to another collaborator to connect direct SharedTree clients to the same document.

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
