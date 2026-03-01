# Worked Examples

This directory contains complete, executable message flow examples demonstrating the Fluid Framework protocol.

## Examples

| Example | Description |
|---------|-------------|
| [01-document-creation.md](./01-document-creation.md) | Creating a new document with initial summary |
| [02-client-connection.md](./02-client-connection.md) | WebSocket connection and handshake flow |
| [03-operation-sequencing.md](./03-operation-sequencing.md) | Submitting and receiving sequenced operations |
| [04-signal-broadcast.md](./04-signal-broadcast.md) | Broadcasting signals (v1 and v2 formats) |
| [05-summary-upload.md](./05-summary-upload.md) | Uploading summaries via Git storage API |
| [06-error-handling.md](./06-error-handling.md) | Handling errors and nack scenarios |
| [07-reconnection-catchup.md](./07-reconnection-catchup.md) | Reconnecting and catching up on missed ops |

## Reading the Examples

Each example includes:

1. **Scenario Description** - What the example demonstrates
2. **Prerequisites** - Required state or setup
3. **Step-by-Step Flow** - Detailed message exchanges
4. **Full JSON Payloads** - Copy-paste ready message formats
5. **Error Scenarios** - Common failure cases and handling

## Testing Against Tinylicious

These examples are designed to be executable against [Tinylicious](https://github.com/microsoft/FluidFramework/tree/main/server/routerlicious/packages/tinylicious), the reference Fluid server implementation.

### Starting Tinylicious

```bash
npx tinylicious
```

Default endpoints:
- HTTP: `http://localhost:7070`
- WebSocket: `ws://localhost:7070`

### Testing HTTP Endpoints

```bash
# Create document
curl -X POST http://localhost:7070/documents/fluid \
  -H "Content-Type: application/json" \
  -d '{"summary":{"type":1,"tree":{}},"sequenceNumber":0,"values":[]}'

# Get deltas
curl http://localhost:7070/deltas/fluid/your-doc-id
```

### Testing WebSocket

Use Socket.IO client to connect:

```javascript
const io = require("socket.io-client");

const socket = io("http://localhost:7070");

socket.emit("connect_document", {
  tenantId: "fluid",
  id: "your-doc-id",
  token: null,  // Tinylicious doesn't require auth
  client: {
    mode: "write",
    details: { capabilities: { interactive: true } },
    permission: [],
    user: { id: "test-user" },
    scopes: []
  },
  versions: ["^0.4.0"],
  mode: "write"
});

socket.on("connect_document_success", (response) => {
  console.log("Connected!", response.clientId);
});
```

## Implementation Checklist

Use these examples to verify your server implementation:

- [ ] Document creation returns valid document ID
- [ ] Connection handshake completes successfully
- [ ] Operations are sequenced with monotonically increasing sequence numbers
- [ ] Operations are broadcast to all connected clients
- [ ] MSN advances correctly as clients send operations
- [ ] Signals are broadcast to connected clients (not persisted)
- [ ] Nacks are sent for invalid operations
- [ ] Delta retrieval returns correct operation range
- [ ] Git storage APIs store and retrieve objects correctly
- [ ] Summary upload and acknowledgment works
