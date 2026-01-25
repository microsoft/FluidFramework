# Example: Error Handling and Nack Scenarios

This example demonstrates various error conditions and how to handle them.

## Error Response Formats

### Connection Errors

Sent via `connect_document_error` event:

```json
{
  "code": 403,
  "message": "Invalid or expired token"
}
```

### Operation/Signal Errors

Sent via `nack` event:

```json
{
  "operation": { ... },
  "sequenceNumber": -1,
  "content": {
    "code": 400,
    "type": "BadRequestError",
    "message": "Error description"
  }
}
```

## Connection Error Scenarios

### Invalid Connection Message (400)

**Cause:** Malformed `connect_document` payload

**Server Response:**
```json
{
  "code": 400,
  "message": "Invalid connection message"
}
```

**Client Handling:**
```javascript
socket.on("connect_document_error", (error) => {
  if (error.code === 400) {
    console.error("Connection payload is malformed:", error.message);
    // Fix the connection message and retry
  }
});
```

### Invalid/Expired Token (403)

**Cause:** JWT signature invalid, token expired, or revoked

**Server Response:**
```json
{
  "code": 403,
  "message": "Invalid or expired token"
}
```

**Client Handling:**
```javascript
socket.on("connect_document_error", (error) => {
  if (error.code === 403) {
    console.error("Authentication failed:", error.message);
    // Obtain new token and reconnect
    refreshToken().then((newToken) => {
      reconnect(newToken);
    });
  }
});
```

### Document Not Found (404)

**Cause:** Document does not exist or has been deleted

**Server Response:**
```json
{
  "code": 404,
  "message": "Document not found"
}
```

**Client Handling:**
```javascript
socket.on("connect_document_error", (error) => {
  if (error.code === 404) {
    console.error("Document does not exist");
    // Create document or show error to user
  }
});
```

### Too Many Clients (429)

**Cause:** Maximum concurrent clients exceeded

**Server Response:**
```json
{
  "code": 429,
  "message": "Maximum clients exceeded"
}
```

**Client Handling:**
```javascript
socket.on("connect_document_error", (error) => {
  if (error.code === 429) {
    console.error("Too many clients connected");
    // Wait and retry with exponential backoff
    setTimeout(() => reconnect(), 5000);
  }
});
```

### Server Unavailable (503)

**Cause:** Server is draining or under maintenance

**Server Response:**
```json
{
  "code": 503,
  "message": "Service unavailable"
}
```

**Client Handling:**
```javascript
socket.on("connect_document_error", (error) => {
  if (error.code === 503) {
    console.error("Server unavailable");
    // Connect to different server or wait
    connectToAlternateServer();
  }
});
```

## Operation Nack Scenarios

### Read-Only Client Submitting Op (400)

**Cause:** Client connected in read mode attempts submitOp

**Nack Response:**
```json
{
  "operation": {
    "clientSequenceNumber": 1,
    "referenceSequenceNumber": 10,
    "type": "op",
    "contents": { "type": "insert" }
  },
  "sequenceNumber": -1,
  "content": {
    "code": 400,
    "type": "BadRequestError",
    "message": "Readonly client"
  }
}
```

**Client Handling:**
```javascript
socket.on("nack", (clientId, nacks) => {
  for (const nack of nacks) {
    if (nack.content.message === "Readonly client") {
      console.error("Cannot submit ops in read mode");
      // Reconnect in write mode if needed
      reconnectWithWriteMode();
    }
  }
});
```

### Missing Write Scope (403)

**Cause:** Token lacks `doc:write` scope

**Nack Response:**
```json
{
  "operation": { ... },
  "sequenceNumber": -1,
  "content": {
    "code": 403,
    "type": "InvalidScopeError",
    "message": "Invalid scope"
  }
}
```

**Client Handling:**
```javascript
socket.on("nack", (clientId, nacks) => {
  for (const nack of nacks) {
    if (nack.content.type === "InvalidScopeError") {
      console.error("Token lacks required scope");
      // Obtain token with proper scopes
      refreshTokenWithScopes(["doc:read", "doc:write"]);
    }
  }
});
```

### Operation Too Large (413)

**Cause:** Operation exceeds `maxMessageSize`

**Nack Response:**
```json
{
  "operation": { ... },
  "sequenceNumber": -1,
  "content": {
    "code": 413,
    "type": "BadRequestError",
    "message": "Op size too large"
  }
}
```

**Client Handling:**
```javascript
socket.on("nack", (clientId, nacks) => {
  for (const nack of nacks) {
    if (nack.content.code === 413) {
      console.error("Operation too large, need to chunk");
      // Split operation into smaller chunks
      const chunks = splitOperation(nack.operation);
      for (const chunk of chunks) {
        submitOp(chunk);
      }
    }
  }
});
```

### Rate Limited (429 - Throttling)

**Cause:** Too many operations submitted too quickly

**Nack Response:**
```json
{
  "operation": { ... },
  "sequenceNumber": -1,
  "content": {
    "code": 429,
    "type": "ThrottlingError",
    "message": "Rate limit exceeded",
    "retryAfter": 5
  }
}
```

**Client Handling:**
```javascript
socket.on("nack", (clientId, nacks) => {
  for (const nack of nacks) {
    if (nack.content.type === "ThrottlingError") {
      const retryAfter = nack.content.retryAfter || 5;
      console.log(`Rate limited, retrying after ${retryAfter}s`);

      // Queue the operation for retry
      pendingOps.push(nack.operation);

      // Retry after specified delay
      setTimeout(() => {
        resubmitPendingOps();
      }, retryAfter * 1000);
    }
  }
});
```

### Server Limit Exceeded (429 - Limit)

**Cause:** Server capacity exceeded (non-retryable)

**Nack Response:**
```json
{
  "operation": { ... },
  "sequenceNumber": -1,
  "content": {
    "code": 429,
    "type": "LimitExceededError",
    "message": "Server capacity exceeded"
  }
}
```

**Client Handling:**
```javascript
socket.on("nack", (clientId, nacks) => {
  for (const nack of nacks) {
    if (nack.content.type === "LimitExceededError") {
      console.error("Server limit exceeded, cannot retry");
      // Show error to user, do not retry automatically
      showErrorToUser("Server is overloaded. Please try again later.");
    }
  }
});
```

## Signal Nack Scenarios

### Nonexistent Client (400)

**Cause:** Signal references unknown client ID

**Nack Response:**
```json
{
  "operation": null,
  "sequenceNumber": -1,
  "content": {
    "code": 400,
    "type": "BadRequestError",
    "message": "Nonexistent client"
  }
}
```

### Invalid Signal Format (400)

**Cause:** Signal message doesn't match expected format

**Nack Response:**
```json
{
  "operation": null,
  "sequenceNumber": -1,
  "content": {
    "code": 400,
    "type": "BadRequestError",
    "message": "Invalid signal message"
  }
}
```

## Comprehensive Error Handler

```javascript
class FluidErrorHandler {
  constructor(socket, connectionManager) {
    this.socket = socket;
    this.connectionManager = connectionManager;
    this.pendingOps = [];

    this.setupListeners();
  }

  setupListeners() {
    this.socket.on("connect_document_error", (error) => {
      this.handleConnectionError(error);
    });

    this.socket.on("nack", (clientId, nacks) => {
      for (const nack of nacks) {
        this.handleNack(nack);
      }
    });

    this.socket.on("disconnect", (reason) => {
      this.handleDisconnect(reason);
    });
  }

  handleConnectionError(error) {
    switch (error.code) {
      case 400:
        throw new Error(`Invalid connection: ${error.message}`);
      case 403:
        this.connectionManager.refreshToken();
        break;
      case 404:
        throw new Error("Document not found");
      case 429:
        this.scheduleReconnect(5000);
        break;
      case 503:
        this.connectionManager.connectToAlternate();
        break;
      default:
        throw new Error(`Connection error: ${error.message}`);
    }
  }

  handleNack(nack) {
    const { code, type, message, retryAfter } = nack.content;

    switch (type) {
      case "BadRequestError":
        if (code === 413) {
          this.handleOversizedOp(nack.operation);
        } else {
          console.error(`Bad request: ${message}`);
        }
        break;

      case "InvalidScopeError":
        this.connectionManager.refreshToken(["doc:read", "doc:write"]);
        break;

      case "ThrottlingError":
        this.scheduleRetry(nack.operation, retryAfter);
        break;

      case "LimitExceededError":
        this.notifyUser("Server capacity exceeded");
        break;
    }
  }

  handleDisconnect(reason) {
    console.log(`Disconnected: ${reason}`);
    // Socket.IO handles automatic reconnection
  }

  handleOversizedOp(operation) {
    // Implementation: chunk the operation
  }

  scheduleRetry(operation, delaySeconds) {
    if (operation) {
      this.pendingOps.push(operation);
    }
    setTimeout(() => this.retryPendingOps(), delaySeconds * 1000);
  }

  scheduleReconnect(delayMs) {
    setTimeout(() => this.connectionManager.reconnect(), delayMs);
  }

  retryPendingOps() {
    while (this.pendingOps.length > 0) {
      const op = this.pendingOps.shift();
      this.socket.emit("submitOp", this.clientId, [op]);
    }
  }

  notifyUser(message) {
    // Show error to user
  }
}
```

## HTTP API Errors

### Document Operations

| Status | Meaning |
|--------|---------|
| 400 | Invalid request body or parameters |
| 403 | Insufficient permissions |
| 404 | Document not found |
| 500 | Internal server error |
| 503 | Service unavailable |

### Delta Operations

| Status | Meaning |
|--------|---------|
| 400 | Invalid range parameters |
| 403 | Insufficient permissions |
| 404 | Document not found |
| 500 | Internal server error |

### Git Storage Operations

| Status | Meaning |
|--------|---------|
| 400 | Invalid object format |
| 404 | Object not found |
| 500 | Storage error |
