# Example: Signal Broadcasting

This example demonstrates sending ephemeral signals between clients.

## Signal Characteristics

- Signals are NOT sequenced (no sequence number)
- Signals are NOT persisted (not stored in delta history)
- Signals are broadcast immediately to connected clients
- Signals can target specific clients or broadcast to all

## Signal Format v1 (Legacy)

### Sending a Signal (v1)

**Client → Server (submitSignal):**

```javascript
socket.emit("submitSignal", "client-aaa", [
  JSON.stringify({
    address: "/_scheduler",
    contents: {
      type: "PresenceUpdate",
      content: {
        cursor: { x: 100, y: 200 },
        selection: { start: 5, end: 10 }
      }
    },
    clientBroadcastSignalSequenceNumber: 1
  })
]);
```

### Receiving a Signal (v1)

**Server → All Clients (signal event):**

```javascript
socket.on("signal", (signal) => {
  const content = JSON.parse(signal.content);
  console.log(`Signal from ${signal.clientId}: ${content.type}`);
});
```

**Payload:**
```json
{
  "clientId": "client-aaa",
  "content": "{\"address\":\"/_scheduler\",\"contents\":{\"type\":\"PresenceUpdate\",\"content\":{\"cursor\":{\"x\":100,\"y\":200},\"selection\":{\"start\":5,\"end\":10}}},\"clientBroadcastSignalSequenceNumber\":1}"
}
```

## Signal Format v2 (Current)

Signal v2 requires both client and server to have `submit_signals_v2` feature enabled.

### Feature Check

During connection, verify feature support:
```json
{
  "supportedFeatures": {
    "submit_signals_v2": true
  }
}
```

### Sending a Signal (v2)

**Client → Server (submitSignal):**

```javascript
socket.emit("submitSignal", "client-aaa", [
  {
    content: {
      type: "PresenceUpdate",
      data: {
        cursor: { x: 100, y: 200 },
        selection: { start: 5, end: 10 }
      }
    },
    type: "presence",
    clientConnectionNumber: 1,
    referenceSequenceNumber: 42
  }
]);
```

**Message Structure:**
```json
{
  "content": {
    "type": "PresenceUpdate",
    "data": {
      "cursor": { "x": 100, "y": 200 },
      "selection": { "start": 5, "end": 10 }
    }
  },
  "type": "presence",
  "clientConnectionNumber": 1,
  "referenceSequenceNumber": 42
}
```

### Receiving a Signal (v2)

**Server → All Clients:**

```json
{
  "clientId": "client-aaa",
  "content": {
    "type": "PresenceUpdate",
    "data": {
      "cursor": { "x": 100, "y": 200 },
      "selection": { "start": 5, "end": 10 }
    }
  },
  "type": "presence",
  "clientConnectionNumber": 1,
  "referenceSequenceNumber": 42
}
```

## Targeted Signals (v2 Only)

Send a signal to a specific client:

**Client → Server:**

```javascript
socket.emit("submitSignal", "client-aaa", [
  {
    content: {
      type: "DirectMessage",
      data: { message: "Hello, client-bbb!" }
    },
    type: "dm",
    targetClientId: "client-bbb"
  }
]);
```

Only `client-bbb` receives this signal.

## Batch Signals

Send multiple signals in one call:

```javascript
socket.emit("submitSignal", "client-aaa", [
  {
    content: { type: "CursorMove", x: 100, y: 100 },
    type: "cursor",
    clientConnectionNumber: 1
  },
  {
    content: { type: "CursorMove", x: 110, y: 105 },
    type: "cursor",
    clientConnectionNumber: 2
  },
  {
    content: { type: "CursorMove", x: 120, y: 110 },
    type: "cursor",
    clientConnectionNumber: 3
  }
]);
```

## System Signals

The server emits system signals for client join/leave:

### Client Join Signal

When a new client connects:

```json
{
  "clientId": null,
  "content": "{\"type\":\"join\",\"content\":{\"clientId\":\"client-xyz\",\"client\":{\"mode\":\"write\",\"details\":{\"capabilities\":{\"interactive\":true},\"type\":\"browser\"},\"permission\":[],\"user\":{\"id\":\"user-new\"},\"scopes\":[\"doc:read\",\"doc:write\"]}}}"
}
```

**Parsed content:**
```json
{
  "type": "join",
  "content": {
    "clientId": "client-xyz",
    "client": {
      "mode": "write",
      "details": {
        "capabilities": { "interactive": true },
        "type": "browser"
      },
      "permission": [],
      "user": { "id": "user-new" },
      "scopes": ["doc:read", "doc:write"]
    }
  }
}
```

### Client Leave Signal

When a client disconnects:

```json
{
  "clientId": null,
  "content": "{\"type\":\"leave\",\"content\":\"client-xyz\"}"
}
```

**Parsed content:**
```json
{
  "type": "leave",
  "content": "client-xyz"
}
```

## Runtime Message Signal (External Broadcast)

Signals can be sent via HTTP API and broadcast to connected clients:

**HTTP Request:**
```http
POST /tenant-abc/doc-12345/broadcast-signal HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "signalContent": {
    "contents": {
      "type": "ExternalNotification",
      "content": {
        "message": "Document updated externally"
      }
    }
  }
}
```

**Resulting Signal to Clients:**
```json
{
  "clientId": null,
  "content": "{\"type\":\"RuntimeMessage\",\"contents\":{\"type\":\"ExternalNotification\",\"content\":{\"message\":\"Document updated externally\"}}}"
}
```

## Common Signal Use Cases

### Presence Awareness

```json
{
  "type": "presence",
  "content": {
    "type": "UserPresence",
    "data": {
      "userId": "user-123",
      "cursor": { "x": 150, "y": 300 },
      "selection": { "start": 10, "end": 20 },
      "status": "active"
    }
  }
}
```

### Typing Indicators

```json
{
  "type": "typing",
  "content": {
    "type": "TypingIndicator",
    "data": {
      "userId": "user-123",
      "isTyping": true,
      "fieldId": "comment-input"
    }
  }
}
```

### Custom Application Events

```json
{
  "type": "custom",
  "content": {
    "type": "GameMove",
    "data": {
      "playerId": "player-1",
      "move": "e2-e4",
      "timestamp": 1706180500000
    }
  }
}
```

## Rate Limiting

Signals are subject to rate limiting. If exceeded:

```json
{
  "operation": null,
  "sequenceNumber": -1,
  "content": {
    "code": 429,
    "type": "ThrottlingError",
    "message": "Signal rate limit exceeded",
    "retryAfter": 5
  }
}
```
