# Example: Operation Submission and Sequencing

This example demonstrates submitting operations and receiving sequenced results.

## Scenario

Two clients are connected to the same document. Client A inserts text while Client B is also editing.

## Initial State

- Document sequence number: 10
- Client A (`client-aaa`) last received: SN 10
- Client B (`client-bbb`) last received: SN 10

## Step 1: Client A Submits Operation

**Client A → Server (submitOp):**

```javascript
socket.emit("submitOp", "client-aaa", [
  {
    clientSequenceNumber: 1,
    referenceSequenceNumber: 10,
    type: "op",
    contents: {
      type: "insert",
      path: "/root/text",
      position: 0,
      value: "Hello"
    },
    metadata: {
      batch: false
    }
  }
]);
```

**Full Message Structure:**
```json
{
  "clientSequenceNumber": 1,
  "referenceSequenceNumber": 10,
  "type": "op",
  "contents": {
    "type": "insert",
    "path": "/root/text",
    "position": 0,
    "value": "Hello"
  },
  "metadata": {
    "batch": false
  },
  "traces": [
    {
      "service": "client",
      "action": "start",
      "timestamp": 1706180500000.123
    }
  ]
}
```

## Step 2: Server Sequences the Operation

The ordering service:
1. Validates client has write permission
2. Assigns sequence number 11
3. Calculates new MSN based on all clients' reference numbers
4. Adds server timestamp
5. Broadcasts to all connected clients

## Step 3: All Clients Receive Sequenced Op

**Server → All Clients (op event):**

```javascript
socket.on("op", (documentId, ops) => {
  // Process sequenced operations
  for (const op of ops) {
    console.log(`SN: ${op.sequenceNumber}, Type: ${op.type}`);
  }
});
```

**Payload:**
```json
{
  "documentId": "doc-12345",
  "op": [
    {
      "clientId": "client-aaa",
      "sequenceNumber": 11,
      "minimumSequenceNumber": 10,
      "clientSequenceNumber": 1,
      "referenceSequenceNumber": 10,
      "type": "op",
      "contents": {
        "type": "insert",
        "path": "/root/text",
        "position": 0,
        "value": "Hello"
      },
      "metadata": {
        "batch": false
      },
      "timestamp": 1706180500500,
      "traces": [
        {
          "service": "client",
          "action": "start",
          "timestamp": 1706180500000.123
        },
        {
          "service": "nexus",
          "action": "start",
          "timestamp": 1706180500250.456
        }
      ]
    }
  ]
}
```

## Step 4: Concurrent Operation from Client B

While Client A's op was in flight, Client B also submitted:

**Client B → Server (submitOp):**
```json
{
  "clientSequenceNumber": 1,
  "referenceSequenceNumber": 10,
  "type": "op",
  "contents": {
    "type": "insert",
    "path": "/root/text",
    "position": 0,
    "value": "World"
  }
}
```

Server assigns sequence number 12 (after Client A's op).

**Server → All Clients:**
```json
{
  "documentId": "doc-12345",
  "op": [
    {
      "clientId": "client-bbb",
      "sequenceNumber": 12,
      "minimumSequenceNumber": 10,
      "clientSequenceNumber": 1,
      "referenceSequenceNumber": 10,
      "type": "op",
      "contents": {
        "type": "insert",
        "path": "/root/text",
        "position": 0,
        "value": "World"
      },
      "timestamp": 1706180500600
    }
  ]
}
```

## Step 5: Batch Operations

Clients can submit multiple operations in a single message:

**Client A → Server:**
```javascript
socket.emit("submitOp", "client-aaa", [
  [
    {
      clientSequenceNumber: 2,
      referenceSequenceNumber: 12,
      type: "op",
      contents: { type: "insert", position: 5, value: " " }
    },
    {
      clientSequenceNumber: 3,
      referenceSequenceNumber: 12,
      type: "op",
      contents: { type: "insert", position: 6, value: "there" }
    }
  ]
]);
```

Each operation in the batch gets its own sequence number (13, 14).

## Step 6: NoOp for MSN Advancement

If a client hasn't sent ops but needs to advance MSN:

**Client B → Server:**
```json
{
  "clientSequenceNumber": 2,
  "referenceSequenceNumber": 14,
  "type": "noop",
  "contents": null
}
```

The server may coalesce or drop NoOps if another message already advanced the client's reference.

## MSN Calculation Example

After the operations above:

| Client | Last RSN Sent |
|--------|---------------|
| client-aaa | 12 |
| client-bbb | 14 |

MSN = min(12, 14) = 12

When client-aaa sends an op with RSN 14:
MSN = min(14, 14) = 14

## System Messages

### Client Join (type: "join")

When a new client joins, the server sends a join op:

```json
{
  "clientId": null,
  "sequenceNumber": 15,
  "minimumSequenceNumber": 14,
  "clientSequenceNumber": 0,
  "referenceSequenceNumber": -1,
  "type": "join",
  "contents": null,
  "data": "{\"clientId\":\"client-ccc\",\"detail\":{\"mode\":\"write\",\"details\":{\"capabilities\":{\"interactive\":true}},\"user\":{\"id\":\"user-789\"},\"scopes\":[\"doc:read\",\"doc:write\"]}}",
  "timestamp": 1706180600000
}
```

### Client Leave (type: "leave")

When a client disconnects:

```json
{
  "clientId": null,
  "sequenceNumber": 16,
  "minimumSequenceNumber": 14,
  "clientSequenceNumber": 0,
  "referenceSequenceNumber": -1,
  "type": "leave",
  "contents": null,
  "data": "\"client-ccc\"",
  "timestamp": 1706180700000
}
```

## Error Handling

See [06-error-handling.md](./06-error-handling.md) for nack scenarios.
