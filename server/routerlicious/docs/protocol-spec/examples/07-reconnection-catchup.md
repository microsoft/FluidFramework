# Example: Reconnection and Catch-up

This example demonstrates reconnecting to a document after disconnection and catching up on missed operations.

## Reconnection Scenario

1. Client was connected and receiving ops
2. Network interruption causes disconnection
3. Client reconnects
4. Client fetches missed operations
5. Client resumes real-time collaboration

## State Before Disconnection

```
Client State:
- Connected to: tenant-abc/doc-12345
- Last received sequence number: 50
- Client ID: client-aaa
- Pending local operations: 2 (CSN 10, 11)
```

## Step 1: Detect Disconnection

Socket.IO emits disconnect event:

```javascript
socket.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
  // reason: "transport close", "ping timeout", etc.

  // Store last known state
  this.lastSequenceNumber = 50;
  this.wasConnected = true;
});
```

## Step 2: Socket.IO Automatic Reconnection

Socket.IO automatically attempts reconnection with exponential backoff:

```javascript
const socket = io("wss://fluid-server.example.com", {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000
});

socket.on("reconnect", (attemptNumber) => {
  console.log(`Reconnected after ${attemptNumber} attempts`);
});

socket.on("reconnect_attempt", (attemptNumber) => {
  console.log(`Reconnection attempt ${attemptNumber}`);
});

socket.on("reconnect_failed", () => {
  console.error("Failed to reconnect after all attempts");
});
```

## Step 3: Re-establish Document Connection

After socket reconnects, send `connect_document` again:

```javascript
socket.on("reconnect", () => {
  // Get fresh token if needed
  const token = getValidToken();

  socket.emit("connect_document", {
    tenantId: "tenant-abc",
    id: "doc-12345",
    token: token,
    client: {
      mode: "write",
      details: {
        capabilities: { interactive: true },
        type: "browser"
      },
      permission: [],
      user: { id: "user-123" },
      scopes: ["doc:read", "doc:write"]
    },
    versions: ["^0.4.0"],
    mode: "write",
    nonce: generateNonce(),
    epoch: this.lastEpoch  // Include last known epoch
  });
});
```

## Step 4: Handle Connection Response

```javascript
socket.on("connect_document_success", (response) => {
  // New client ID may be different
  this.clientId = response.clientId;

  // Check sequence number to determine catch-up needs
  const serverSeq = response.checkpointSequenceNumber || 0;
  const lastKnownSeq = this.lastSequenceNumber;

  console.log(`Server at SN ${serverSeq}, last known SN ${lastKnownSeq}`);

  if (serverSeq > lastKnownSeq) {
    // Need to fetch missed operations
    this.fetchMissedOps(lastKnownSeq, serverSeq);
  }

  // Check if epoch changed (indicates summary was taken)
  if (response.epoch !== this.lastEpoch) {
    console.log("Epoch changed, may need full refresh");
    // Handle epoch change (might need to load from summary)
  }

  // Update initial clients list
  this.updateClientList(response.initialClients);
});
```

## Step 5: Fetch Missed Operations via HTTP

```javascript
async function fetchMissedOps(fromSeq, toSeq) {
  const token = getValidToken();

  // Fetch ops in batches (max 2000 per request)
  let currentFrom = fromSeq;

  while (currentFrom < toSeq) {
    const response = await fetch(
      `https://fluid-server.example.com/deltas/tenant-abc/doc-12345?from=${currentFrom}&to=${toSeq}`,
      {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch deltas: ${response.status}`);
    }

    const ops = await response.json();

    if (ops.length === 0) {
      break;
    }

    // Process each operation
    for (const op of ops) {
      processSequencedOp(op);
    }

    // Update position for next batch
    currentFrom = ops[ops.length - 1].sequenceNumber;
  }

  console.log(`Caught up to SN ${currentFrom}`);
}
```

**HTTP Request:**
```http
GET /deltas/tenant-abc/doc-12345?from=50&to=75 HTTP/1.1
Host: fluid-server.example.com
Authorization: Bearer <token>
```

**HTTP Response:**
```json
[
  {
    "sequenceNumber": 51,
    "clientId": "client-bbb",
    "minimumSequenceNumber": 48,
    "clientSequenceNumber": 15,
    "referenceSequenceNumber": 50,
    "type": "op",
    "contents": { "type": "insert", "text": "Hello" },
    "timestamp": 1706180550000
  },
  {
    "sequenceNumber": 52,
    "clientId": "client-bbb",
    "minimumSequenceNumber": 50,
    "clientSequenceNumber": 16,
    "referenceSequenceNumber": 51,
    "type": "op",
    "contents": { "type": "insert", "text": " World" },
    "timestamp": 1706180551000
  }
]
```

## Step 6: Handle Pending Local Operations

Operations that were submitted but not acknowledged need to be resubmitted:

```javascript
class PendingOpManager {
  constructor() {
    this.pendingOps = new Map(); // CSN -> operation
  }

  addPending(op) {
    this.pendingOps.set(op.clientSequenceNumber, op);
  }

  acknowledge(csn) {
    this.pendingOps.delete(csn);
  }

  getPendingOps() {
    return Array.from(this.pendingOps.values())
      .sort((a, b) => a.clientSequenceNumber - b.clientSequenceNumber);
  }

  resubmitPending(socket, clientId) {
    const pending = this.getPendingOps();

    if (pending.length > 0) {
      console.log(`Resubmitting ${pending.length} pending ops`);

      // Resubmit with updated reference sequence numbers
      for (const op of pending) {
        op.referenceSequenceNumber = this.lastReceivedSeq;
        socket.emit("submitOp", clientId, [op]);
      }
    }
  }
}
```

## Step 7: Resume Real-time Collaboration

Once caught up, resume listening for new operations:

```javascript
socket.on("op", (documentId, ops) => {
  for (const op of ops) {
    // Check if this acknowledges a pending local op
    if (op.clientId === this.clientId) {
      this.pendingOpManager.acknowledge(op.clientSequenceNumber);
    }

    // Process the operation
    processSequencedOp(op);

    // Update last received sequence number
    this.lastSequenceNumber = op.sequenceNumber;
  }
});
```

## Handling Epoch Changes

If the epoch changed during disconnection, a summary may have been taken:

```javascript
async function handleEpochChange(oldEpoch, newEpoch) {
  console.log(`Epoch changed from ${oldEpoch} to ${newEpoch}`);

  // Fetch the latest summary
  const summaryRef = await fetch(
    `https://fluid-server.example.com/repos/tenant-abc/git/refs/heads/main`,
    { headers: { "Authorization": `Bearer ${token}` } }
  );

  const ref = await summaryRef.json();

  // Load from summary if operations since summary are available
  // Otherwise, need full document reload

  // Get commit to find summary sequence number
  const commit = await fetch(
    `https://fluid-server.example.com/repos/tenant-abc/git/commits/${ref.object.sha}`,
    { headers: { "Authorization": `Bearer ${token}` } }
  );

  // Load document state from summary
  await loadFromSummary(ref.object.sha);
}
```

## Complete Reconnection Flow

```javascript
class ReconnectionHandler {
  constructor(socket, documentId, tenantId) {
    this.socket = socket;
    this.documentId = documentId;
    this.tenantId = tenantId;
    this.lastSequenceNumber = 0;
    this.lastEpoch = null;
    this.clientId = null;
    this.pendingOps = new PendingOpManager();

    this.setupListeners();
  }

  setupListeners() {
    this.socket.on("disconnect", (reason) => {
      console.log("Disconnected:", reason);
    });

    this.socket.on("reconnect", async () => {
      await this.handleReconnect();
    });

    this.socket.on("connect_document_success", async (response) => {
      await this.handleConnectSuccess(response);
    });

    this.socket.on("op", (docId, ops) => {
      this.handleOps(ops);
    });
  }

  async handleReconnect() {
    const token = await getValidToken();

    this.socket.emit("connect_document", {
      tenantId: this.tenantId,
      id: this.documentId,
      token: token,
      client: this.getClientDetails(),
      versions: ["^0.4.0"],
      mode: "write",
      nonce: generateNonce(),
      epoch: this.lastEpoch
    });
  }

  async handleConnectSuccess(response) {
    this.clientId = response.clientId;

    // Check for epoch change
    if (this.lastEpoch && response.epoch !== this.lastEpoch) {
      await this.handleEpochChange(response.epoch);
      return;
    }

    this.lastEpoch = response.epoch;

    // Fetch missed operations
    const serverSeq = response.checkpointSequenceNumber || 0;
    if (serverSeq > this.lastSequenceNumber) {
      await this.fetchMissedOps(this.lastSequenceNumber, serverSeq);
    }

    // Resubmit pending operations
    this.pendingOps.resubmitPending(this.socket, this.clientId);

    console.log("Reconnection complete, resuming collaboration");
  }

  handleOps(ops) {
    for (const op of ops) {
      if (op.clientId === this.clientId) {
        this.pendingOps.acknowledge(op.clientSequenceNumber);
      }
      this.lastSequenceNumber = op.sequenceNumber;
    }
  }

  async fetchMissedOps(from, to) {
    // Implementation as shown above
  }

  async handleEpochChange(newEpoch) {
    // Implementation as shown above
  }

  getClientDetails() {
    return {
      mode: "write",
      details: { capabilities: { interactive: true } },
      permission: [],
      user: { id: "user-123" },
      scopes: ["doc:read", "doc:write"]
    };
  }
}
```

## Best Practices

1. **Store last known state** - Track sequence number and epoch before disconnect
2. **Use nonces** - Unique nonce per connection attempt helps track connection state
3. **Handle pending ops** - Resubmit unacknowledged operations after reconnect
4. **Check epoch** - Epoch changes may require loading from summary
5. **Batch delta fetches** - Respect server limits (typically 2000 ops per request)
6. **Exponential backoff** - Use Socket.IO's built-in reconnection with backoff
7. **Token refresh** - Tokens may expire during long disconnections
