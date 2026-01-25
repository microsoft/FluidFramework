# Example: Client Connection and Handshake

This example demonstrates a client connecting to an existing document via WebSocket.

## Prerequisites

- Document exists: `tenant-abc/doc-12345`
- Valid JWT token
- Socket.IO client library

## Step 1: Establish Socket.IO Connection

Connect to the server's Socket.IO endpoint:

```javascript
const socket = io("wss://fluid-server.example.com", {
  transports: ["websocket", "polling"],
  reconnection: true
});
```

## Step 2: Send connect_document Event

**Client → Server:**

```javascript
socket.emit("connect_document", {
  tenantId: "tenant-abc",
  id: "doc-12345",
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkb2N1bWVudElkIjoiZG9jLTEyMzQ1Iiwic2NvcGVzIjpbImRvYzpyZWFkIiwiZG9jOndyaXRlIl0sInRlbmFudElkIjoidGVuYW50LWFiYyIsInVzZXIiOnsiaWQiOiJ1c2VyLTEyMyJ9LCJpYXQiOjE3MDYxODA0MDAsImV4cCI6MTcwNjE4NDAwMCwidmVyIjoiMS4wIn0.signature",
  client: {
    mode: "write",
    details: {
      capabilities: {
        interactive: true
      },
      type: "browser",
      environment: "Chrome/120.0;Windows/10"
    },
    permission: [],
    user: {
      id: "user-123"
    },
    scopes: ["doc:read", "doc:write"]
  },
  versions: ["^0.4.0", "^0.3.0"],
  driverVersion: "2.0.0",
  mode: "write",
  nonce: "abc123-unique-nonce",
  supportedFeatures: {
    "submit_signals_v2": true
  },
  relayUserAgent: "fluid-client:2.0.0;platform:web"
});
```

## Step 3: Receive connect_document_success

**Server → Client:**

```javascript
socket.on("connect_document_success", (response) => {
  console.log("Connected!", response);
});
```

**Response Payload:**
```json
{
  "claims": {
    "documentId": "doc-12345",
    "scopes": ["doc:read", "doc:write"],
    "tenantId": "tenant-abc",
    "user": { "id": "user-123" },
    "iat": 1706180400,
    "exp": 1706184000,
    "ver": "1.0"
  },
  "clientId": "client-xyz-789",
  "existing": true,
  "maxMessageSize": 16384,
  "mode": "write",
  "serviceConfiguration": {
    "blockSize": 65536,
    "maxMessageSize": 16384,
    "noopTimeFrequency": 2000,
    "noopCountFrequency": 50
  },
  "initialClients": [
    {
      "clientId": "client-other-456",
      "client": {
        "mode": "write",
        "details": {
          "capabilities": { "interactive": true },
          "type": "browser"
        },
        "permission": [],
        "user": { "id": "user-456" },
        "scopes": ["doc:read", "doc:write"]
      }
    }
  ],
  "initialMessages": [],
  "initialSignals": [],
  "supportedVersions": ["^0.4.0", "^0.3.0", "^0.2.0", "^0.1.0"],
  "supportedFeatures": {
    "submit_signals_v2": true
  },
  "version": "0.4.0",
  "timestamp": 1706180450000,
  "checkpointSequenceNumber": 42,
  "epoch": "epoch-1",
  "relayServiceAgent": "routerlicious:1.0.0;region:us-west-2"
}
```

## Step 4: Handle Join Signal from Server

Other connected clients receive a join signal:

**Server → Other Clients:**

```json
{
  "clientId": null,
  "content": "{\"type\":\"join\",\"content\":{\"clientId\":\"client-xyz-789\",\"client\":{\"mode\":\"write\",\"details\":{\"capabilities\":{\"interactive\":true},\"type\":\"browser\"},\"permission\":[],\"user\":{\"id\":\"user-123\"},\"scopes\":[\"doc:read\",\"doc:write\"]}}}"
}
```

## Connection Error Handling

### Invalid Token (403)

**Server → Client:**
```javascript
socket.on("connect_document_error", (error) => {
  // error = { code: 403, message: "Invalid or expired token" }
});
```

### Too Many Clients (429)

```javascript
socket.on("connect_document_error", (error) => {
  // error = { code: 429, message: "Maximum clients exceeded" }
});
```

### Document Not Found (404)

```javascript
socket.on("connect_document_error", (error) => {
  // error = { code: 404, message: "Document not found" }
});
```

## Read-Only Connection

For read-only access, set `mode: "read"`:

```javascript
socket.emit("connect_document", {
  tenantId: "tenant-abc",
  id: "doc-12345",
  token: "...",  // Token only needs doc:read scope
  client: {
    mode: "read",
    details: {
      capabilities: { interactive: true }
    },
    permission: [],
    user: { id: "viewer-789" },
    scopes: ["doc:read"]
  },
  versions: ["^0.4.0"],
  mode: "read"
});
```

Read-only clients:
- Receive all operations and signals
- Cannot submit operations (submitOp will be nacked)
- Can submit signals (if scopes allow)

## Server Processing Stages

1. **VersionsChecked** - Validate protocol version compatibility
2. **ThrottleChecked** - Check connection rate limits
3. **TokenVerified** - Validate JWT signature and claims
4. **RoomJoined** - Subscribe socket to document room
5. **ClientsRetrieved** - Fetch list of existing clients
6. **MessageClientCreated** - Create internal client representation
7. **MessageClientAdded** - Add to client manager
8. **TokenExpirySet** - Set token expiration timer (optional)
9. **MessageClientConnected** - Connect to orderer (write clients)
10. **JoinSignalEmitted** - Notify room of new client
