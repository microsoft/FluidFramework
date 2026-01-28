# Example: Summary Upload and Acknowledgment

This example demonstrates uploading a document summary for efficient document loading.

## Summary Purpose

Summaries capture point-in-time snapshots of document state, enabling:
- Fast document loading (load summary + recent ops instead of all ops)
- Garbage collection (ops before summary can be pruned)
- Efficient storage

## Summary Upload Flow Overview

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Client  │     │ Storage │     │ Orderer │
└────┬────┘     └────┬────┘     └────┬────┘
     │               │               │
     │ POST /blobs   │               │
     │──────────────>│               │
     │<──────────────│               │
     │  {sha: "b1"}  │               │
     │               │               │
     │ POST /trees   │               │
     │──────────────>│               │
     │<──────────────│               │
     │  {sha: "t1"}  │               │
     │               │               │
     │ POST /commits │               │
     │──────────────>│               │
     │<──────────────│               │
     │  {sha: "c1"}  │               │
     │               │               │
     │ PATCH /refs   │               │
     │──────────────>│               │
     │<──────────────│               │
     │               │               │
     │ submitOp (summarize)          │
     │──────────────────────────────>│
     │               │               │
     │ op (summaryAck or summaryNack)│
     │<──────────────────────────────│
     │               │               │
```

## Step 1: Upload Blobs

Upload each data blob to git storage:

**Request 1 - Protocol Attributes:**
```http
POST /repos/tenant-abc/git/blobs HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "eyJzZXF1ZW5jZU51bWJlciI6MTAwLCJtaW5pbXVtU2VxdWVuY2VOdW1iZXIiOjk1fQ==",
  "encoding": "base64"
}
```

**Response:**
```json
{
  "sha": "a1b2c3d4e5f6789012345678901234567890abcd",
  "url": ""
}
```

**Request 2 - Application Data:**
```http
POST /repos/tenant-abc/git/blobs HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "eyJ0eXBlIjoiaHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzL21hcCIsImRhdGEiOnsia2V5MSI6InZhbHVlMSIsImtleTIiOiJ2YWx1ZTIifX0=",
  "encoding": "base64"
}
```

**Response:**
```json
{
  "sha": "b2c3d4e5f6789012345678901234567890abcdef",
  "url": ""
}
```

## Step 2: Create Trees

Build the tree structure referencing blobs:

**Request - Inner Tree:**
```http
POST /repos/tenant-abc/git/trees HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "tree": [
    {
      "path": "header",
      "mode": "100644",
      "type": "blob",
      "sha": "b2c3d4e5f6789012345678901234567890abcdef"
    },
    {
      "path": "content",
      "mode": "100644",
      "type": "blob",
      "sha": "c3d4e5f6789012345678901234567890abcdef01"
    }
  ]
}
```

**Response:**
```json
{
  "sha": "tree-inner-12345678901234567890abcdef",
  "url": "",
  "tree": [
    {
      "path": "header",
      "mode": "100644",
      "sha": "b2c3d4e5f6789012345678901234567890abcdef",
      "type": "blob",
      "url": ""
    },
    {
      "path": "content",
      "mode": "100644",
      "sha": "c3d4e5f6789012345678901234567890abcdef01",
      "type": "blob",
      "url": ""
    }
  ]
}
```

**Request - Root Tree:**
```http
POST /repos/tenant-abc/git/trees HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "tree": [
    {
      "path": ".protocol",
      "mode": "040000",
      "type": "tree",
      "sha": "tree-protocol-sha"
    },
    {
      "path": ".app",
      "mode": "040000",
      "type": "tree",
      "sha": "tree-app-sha"
    }
  ]
}
```

**Response:**
```json
{
  "sha": "tree-root-abcdef1234567890abcdef1234",
  "url": "",
  "tree": [...]
}
```

## Step 3: Create Commit

Create a commit pointing to the root tree:

**Request:**
```http
POST /repos/tenant-abc/git/commits HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "tree": "tree-root-abcdef1234567890abcdef1234",
  "parents": ["previous-commit-sha-if-exists"],
  "message": "Summary at SN 100",
  "author": {
    "name": "Fluid Summarizer",
    "email": "summarizer@fluidframework.com",
    "date": "2024-01-25T12:00:00Z"
  }
}
```

**Response:**
```json
{
  "sha": "commit-sha-12345678901234567890abcd",
  "tree": {
    "sha": "tree-root-abcdef1234567890abcdef1234",
    "url": ""
  },
  "parents": [
    {
      "sha": "previous-commit-sha-if-exists",
      "url": ""
    }
  ],
  "message": "Summary at SN 100",
  "author": {
    "name": "Fluid Summarizer",
    "email": "summarizer@fluidframework.com",
    "date": "2024-01-25T12:00:00Z"
  },
  "committer": {
    "name": "Fluid Summarizer",
    "email": "summarizer@fluidframework.com",
    "date": "2024-01-25T12:00:00Z"
  },
  "url": ""
}
```

## Step 4: Update Reference

Update the head reference to point to the new commit:

**Request:**
```http
PATCH /repos/tenant-abc/git/refs/heads/main HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "sha": "commit-sha-12345678901234567890abcd"
}
```

**Response:**
```json
{
  "ref": "refs/heads/main",
  "object": {
    "sha": "commit-sha-12345678901234567890abcd",
    "type": "commit",
    "url": ""
  },
  "url": ""
}
```

## Step 5: Submit Summarize Op

Send a summarize operation through the ordering service:

**Client → Server (submitOp):**

```javascript
socket.emit("submitOp", "client-summarizer", [
  {
    clientSequenceNumber: 5,
    referenceSequenceNumber: 100,
    type: "summarize",
    contents: {
      handle: "commit-sha-12345678901234567890abcd",
      message: "Summary at SN 100",
      parents: ["previous-commit-sha-if-exists"],
      head: "refs/heads/main",
      details: {
        includesProtocolTree: true
      }
    }
  }
]);
```

## Step 6: Receive Summary Acknowledgment

### Success - SummaryAck

**Server → Client (op event):**

```json
{
  "documentId": "doc-12345",
  "op": [
    {
      "clientId": null,
      "sequenceNumber": 101,
      "minimumSequenceNumber": 98,
      "clientSequenceNumber": 0,
      "referenceSequenceNumber": -1,
      "type": "summaryAck",
      "contents": {
        "handle": "final-summary-handle-sha",
        "summaryProposal": {
          "summarySequenceNumber": 100
        }
      },
      "timestamp": 1706180600000
    }
  ]
}
```

### Failure - SummaryNack

```json
{
  "documentId": "doc-12345",
  "op": [
    {
      "clientId": null,
      "sequenceNumber": 101,
      "minimumSequenceNumber": 98,
      "clientSequenceNumber": 0,
      "referenceSequenceNumber": -1,
      "type": "summaryNack",
      "contents": {
        "summaryProposal": {
          "summarySequenceNumber": 100
        },
        "code": 400,
        "message": "Invalid summary tree structure",
        "retryAfter": 60
      },
      "timestamp": 1706180600000
    }
  ]
}
```

## Using Summary Handles

To reuse unchanged parts from previous summaries, use handles:

```json
{
  "type": 1,
  "tree": {
    ".protocol": {
      "type": 3,
      "handleType": 1,
      "handle": ".protocol"
    },
    ".app": {
      "type": 1,
      "tree": {
        "unchanged-dds": {
          "type": 3,
          "handleType": 1,
          "handle": ".app/unchanged-dds"
        },
        "changed-dds": {
          "type": 1,
          "tree": {
            "header": {
              "type": 2,
              "content": "{\"new\":\"data\"}"
            }
          }
        }
      }
    }
  }
}
```

## Summary Best Practices

1. **Summarize at appropriate intervals** - Balance between storage efficiency and summary overhead
2. **Use handles for unchanged data** - Reduces upload size significantly
3. **Include protocol tree** - Ensures quorum state is captured
4. **Handle nacks gracefully** - Retry with backoff if rate limited
5. **Verify summary integrity** - Ensure all referenced handles exist
