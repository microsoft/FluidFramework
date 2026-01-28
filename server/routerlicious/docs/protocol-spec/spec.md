# Fluid Framework Server Protocol Specification

**Version:** 1.0.0
**Status:** Draft
**Date:** 2026-01-25

## Table of Contents

1. [Introduction](#1-introduction)
2. [Architecture Overview](#2-architecture-overview)
3. [Authentication & Authorization](#3-authentication--authorization)
4. [HTTP API: Document Operations](#4-http-api-document-operations)
5. [HTTP API: Delta Operations](#5-http-api-delta-operations)
6. [HTTP API: Git-like Storage](#6-http-api-git-like-storage)
7. [WebSocket Protocol: Connection](#7-websocket-protocol-connection)
8. [WebSocket Protocol: Operations](#8-websocket-protocol-operations)
9. [WebSocket Protocol: Signals](#9-websocket-protocol-signals)
10. [WebSocket Protocol: Errors](#10-websocket-protocol-errors)
11. [Sequence Number Semantics](#11-sequence-number-semantics)
12. [Summary Protocol](#12-summary-protocol)
13. [Quorum & Consensus](#13-quorum--consensus)
14. [Feature Negotiation](#14-feature-negotiation)
15. [Security Considerations](#15-security-considerations)
16. [Appendix A: TypeScript Interfaces](#appendix-a-typescript-interfaces)
17. [Appendix B: MessageType Enumeration](#appendix-b-messagetype-enumeration)

---

## 1. Introduction

### 1.1 Purpose

This specification defines the wire protocol for implementing a Fluid Framework collaboration server. The protocol enables multiple clients to collaborate on shared data structures through operation sequencing and conflict-free state synchronization.

### 1.2 Scope

This document covers:
- HTTP APIs for document management and storage
- WebSocket (Socket.IO) protocol for real-time collaboration
- Message formats and sequencing semantics
- Authentication and authorization requirements

### 1.3 Requirements Language

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

### 1.4 Terminology

| Term | Definition |
|------|------------|
| **Document** | A collaborative data container identified by a tenant ID and document ID pair |
| **Tenant** | An isolated namespace for documents, typically representing an organization or application |
| **Op (Operation)** | A mutation submitted by a client to modify document state |
| **Signal** | An ephemeral message broadcast to connected clients; not persisted or sequenced |
| **Summary** | A point-in-time snapshot of document state, stored as a tree structure |
| **Sequence Number (SN)** | Server-assigned, monotonically increasing identifier for each sequenced operation |
| **Client Sequence Number (CSN)** | Client-assigned, monotonically increasing identifier per client |
| **Reference Sequence Number (RSN)** | The sequence number a client was at when submitting an operation |
| **Minimum Sequence Number (MSN)** | The lowest reference sequence number across all connected clients |
| **Quorum** | The set of connected clients participating in the collaboration session |
| **Orderer** | The server component responsible for assigning sequence numbers to operations |

---

## 2. Architecture Overview

### 2.1 Service Components

A compliant Fluid server MUST implement three logical service components:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Fluid Server                                 │
├─────────────────┬─────────────────────┬─────────────────────────────┤
│  Ordering       │  Storage Service    │  Git Storage Service        │
│  Service        │  (HTTP)             │  (HTTP)                     │
│  (WebSocket)    │                     │                             │
├─────────────────┼─────────────────────┼─────────────────────────────┤
│ - Connection    │ - Document CRUD     │ - Blob storage              │
│ - Op sequencing │ - Delta retrieval   │ - Tree storage              │
│ - Signal relay  │ - Session info      │ - Commit storage            │
│ - Nack/errors   │                     │ - Reference management      │
└─────────────────┴─────────────────────┴─────────────────────────────┘
```

#### 2.1.1 Ordering Service (WebSocket)

The Ordering Service provides real-time collaboration capabilities:
- Client connection and session management
- Operation sequencing (total ordering)
- Signal broadcasting
- Quorum tracking

Transport: Socket.IO over WebSocket (with HTTP long-polling fallback)

#### 2.1.2 Storage Service (HTTP)

The Storage Service provides document management:
- Document creation and retrieval
- Delta (operation history) retrieval
- Session discovery

Transport: HTTP/HTTPS REST API

#### 2.1.3 Git Storage Service (HTTP)

The Git Storage Service provides content-addressable storage:
- Blob storage (raw data)
- Tree storage (directory structures)
- Commit storage (snapshots)
- Reference management (pointers to commits)

Transport: HTTP/HTTPS REST API

### 2.2 Multi-tenancy Model

The server MUST support multi-tenancy where:
- Each tenant has a unique `tenantId` string
- Documents are scoped to tenants: `(tenantId, documentId)` forms a unique key
- Tenants are isolated; cross-tenant access is not permitted
- Tenant credentials (secrets) are used for JWT signing

---

## 3. Authentication & Authorization

### 3.1 JWT Token Structure

All authenticated requests MUST include a JWT token. The token MUST contain the following claims:

```typescript
interface ITokenClaims {
  /** Document ID this token grants access to */
  documentId: string;

  /** Permission scopes granted */
  scopes: string[];

  /** Tenant ID */
  tenantId: string;

  /** User identity */
  user: {
    id: string;
    [key: string]: unknown;  // Additional user properties allowed
  };

  /** Issued At - Unix timestamp (seconds) */
  iat: number;

  /** Expiration Time - Unix timestamp (seconds) */
  exp: number;

  /** Token version */
  ver: string;

  /** JWT ID - unique token identifier (optional) */
  jti?: string;
}
```

### 3.2 Permission Scopes

The following scopes control access to operations:

| Scope | Description | Required For |
|-------|-------------|--------------|
| `doc:read` | Read document data and deltas | GET operations, read-mode connections |
| `doc:write` | Submit operations | Write-mode connections, submitOp |
| `summary:write` | Upload and write summaries | Summary operations |

### 3.3 Token Validation Requirements

Servers MUST validate tokens as follows:

1. **Signature Verification**: Verify JWT signature using tenant secret
2. **Expiration Check**: Reject tokens where `exp < current_time`
3. **Tenant Match**: Token's `tenantId` MUST match request tenant
4. **Document Match**: Token's `documentId` MUST match request document
5. **Scope Check**: Token MUST have required scope(s) for the operation

### 3.4 Token Transmission

- **HTTP Requests**: `Authorization: Bearer <token>` header
- **WebSocket Connection**: Token included in `IConnect.token` field

---

## 4. HTTP API: Document Operations

### 4.1 Create Document

Creates a new document with an initial summary.

```
POST /documents/:tenantId
```

**Request Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```typescript
{
  /** Optional document ID; auto-generated if omitted */
  id?: string;

  /** Initial summary tree */
  summary: ISummaryTree;

  /** Initial sequence number (typically 0) */
  sequenceNumber: number;

  /** Initial protocol values */
  values: [string, ICommittedProposal][];

  /** Optional: allow binary blobs in first summary */
  enableAnyBinaryBlobOnFirstSummary?: boolean;
}
```

**Response (201 Created):**
```json
"<documentId>"
```

**Alternative Response (with session discovery):**
```typescript
{
  id: string;
  token?: string;
  session?: {
    ordererUrl: string;
    historianUrl: string;
    deltaStreamUrl: string;
    isSessionAlive: boolean;
    isSessionActive: boolean;
  };
}
```

**Error Responses:**
- `400 Bad Request` - Invalid request body or validation failure
- `503 Service Unavailable` - Server is draining/unavailable

### 4.2 Get Document

Retrieves document metadata.

```
GET /documents/:tenantId/:id
```

**Request Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```typescript
{
  id: string;
  tenantId: string;
  sequenceNumber: number;
  // Additional document metadata
}
```

**Error Responses:**
- `400 Bad Request` - Invalid token
- `404 Not Found` - Document does not exist

### 4.3 Get Session

Retrieves connection information for a document.

```
GET /documents/:tenantId/session/:id
```

**Request Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```typescript
{
  ordererUrl: string;
  historianUrl: string;
  deltaStreamUrl: string;
  messageBrokerId?: string;
  isSessionAlive: boolean;
  isSessionActive: boolean;
}
```

---

## 5. HTTP API: Delta Operations

### 5.1 Get Deltas

Retrieves sequenced operations for a document.

```
GET /deltas/:tenantId/:id
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `from` | number | Exclusive lower bound on sequence number |
| `to` | number | Exclusive upper bound on sequence number |

**Request Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```typescript
ISequencedDocumentMessage[]
```

**Behavior:**
- If neither `from` nor `to` specified: Returns first 2000 ops from sequence 0
- If only `from` specified: Returns up to 2000 ops after `from`
- If only `to` specified: Returns up to 2000 ops before `to`
- Maximum ops per request: 2000 (configurable)

**Example Request:**
```
GET /deltas/tenant1/doc1?from=100&to=200
```

**Example Response:**
```json
[
  {
    "sequenceNumber": 101,
    "clientSequenceNumber": 5,
    "minimumSequenceNumber": 98,
    "clientId": "client-abc",
    "referenceSequenceNumber": 100,
    "type": "op",
    "contents": { "type": "insert", "pos": 0, "text": "Hello" },
    "timestamp": 1706180400000
  }
]
```

---

## 6. HTTP API: Git-like Storage

The Git Storage API provides content-addressable storage for summaries. Objects are identified by their SHA-256 hash.

### 6.1 Blob Operations

#### Create Blob

```
POST /repos/:tenantId/git/blobs
```

**Request Body:**
```typescript
{
  content: string;      // Base64-encoded content
  encoding: "base64";
}
```

**Response (201 Created):**
```typescript
{
  sha: string;   // SHA-256 hash of content
  url: string;
}
```

#### Get Blob

```
GET /repos/:tenantId/git/blobs/:sha
```

**Response (200 OK):**
```typescript
{
  sha: string;
  size: number;
  content: string;     // Base64-encoded content
  encoding: "base64";
  url: string;
}
```

**Cache Control:** `Cache-Control: public, max-age=31536000`

### 6.2 Tree Operations

#### Create Tree

```
POST /repos/:tenantId/git/trees
```

**Request Body:**
```typescript
{
  tree: Array<{
    path: string;      // File/directory name
    mode: string;      // File mode (e.g., "100644" for file)
    sha: string;       // SHA of blob or tree
    type: "blob" | "tree";
  }>;
}
```

**Response (201 Created):**
```typescript
{
  sha: string;
  url: string;
  tree: Array<{
    path: string;
    mode: string;
    sha: string;
    size?: number;
    type: string;
    url: string;
  }>;
}
```

#### Get Tree

```
GET /repos/:tenantId/git/trees/:sha
GET /repos/:tenantId/git/trees/:sha?recursive=1
```

**Response (200 OK):** Same as create response

### 6.3 Commit Operations

#### Create Commit

```
POST /repos/:tenantId/git/commits
```

**Request Body:**
```typescript
{
  tree: string;           // Tree SHA
  parents: string[];      // Parent commit SHAs
  message: string;        // Commit message
  author: {
    name: string;
    email: string;
    date: string;         // ISO 8601 date
  };
}
```

**Response (201 Created):**
```typescript
{
  sha: string;
  tree: { sha: string; url: string };
  parents: Array<{ sha: string; url: string }>;
  message: string;
  author: { name: string; email: string; date: string };
  committer: { name: string; email: string; date: string };
  url: string;
}
```

#### Get Commit

```
GET /repos/:tenantId/git/commits/:sha
```

**Response (200 OK):** Same as create response

### 6.4 Reference Operations

#### List References

```
GET /repos/:tenantId/git/refs
```

**Response (200 OK):**
```typescript
Array<{
  ref: string;           // e.g., "refs/heads/main"
  object: {
    sha: string;
    type: string;
    url: string;
  };
  url: string;
}>
```

#### Get Reference

```
GET /repos/:tenantId/git/refs/:ref
```

Example: `GET /repos/tenant1/git/refs/heads/main`

**Response (200 OK):** Single ref object

#### Create Reference

```
POST /repos/:tenantId/git/refs
```

**Request Body:**
```typescript
{
  ref: string;    // e.g., "refs/heads/main"
  sha: string;    // Commit SHA
}
```

#### Update Reference

```
PATCH /repos/:tenantId/git/refs/:ref
```

**Request Body:**
```typescript
{
  sha: string;    // New commit SHA
}
```

---

## 7. WebSocket Protocol: Connection

The Ordering Service uses Socket.IO for real-time communication. Socket.IO provides automatic reconnection, fallback transports, and message framing.

### 7.1 Transport Requirements

- Primary transport: WebSocket
- Fallback transport: HTTP long-polling
- Socket.IO protocol version: 4.x recommended
- Namespace: Default (`/`)

### 7.2 Connection Flow

```
Client                                          Server
   │                                               │
   │──────── Socket.IO handshake ────────────────>│
   │<─────── Socket.IO handshake response ────────│
   │                                               │
   │──────── "connect_document" ─────────────────>│
   │         (IConnect payload)                    │
   │                                               │
   │                    [Validation & Setup]       │
   │                                               │
   │<─────── "connect_document_success" ──────────│
   │         (IConnected payload)                  │
   │         OR                                    │
   │<─────── "connect_document_error" ────────────│
   │         (Error payload)                       │
   │                                               │
```

### 7.3 connect_document Event

Sent by client to initiate document collaboration.

**Event Name:** `connect_document`

**Payload (IConnect):**
```typescript
{
  /** Tenant identifier */
  tenantId: string;

  /** Document identifier */
  id: string;

  /** Authorization token (JWT) */
  token: string | null;

  /** Client details */
  client: {
    mode: "write" | "read";
    details: {
      capabilities: {
        interactive: boolean;
      };
      type?: string;
      environment?: string;
      device?: string;
    };
    permission: string[];
    user: { id: string };
    scopes: string[];
    timestamp?: number;
  };

  /** Supported protocol versions (semver ranges) */
  versions: string[];

  /** Client driver version */
  driverVersion?: string;

  /** Connection mode */
  mode: "write" | "read";

  /** Unique nonce for this connection attempt */
  nonce?: string;

  /** Expected document epoch */
  epoch?: string;

  /** Client feature flags */
  supportedFeatures?: Record<string, unknown>;

  /** Client environment info (semicolon-separated key:value pairs) */
  relayUserAgent?: string;
}
```

**Connection Modes:**
- `write`: Client can submit operations (requires `doc:write` scope)
- `read`: Client receives operations but cannot submit (requires `doc:read` scope)

### 7.4 connect_document_success Event

Sent by server when connection succeeds.

**Event Name:** `connect_document_success`

**Payload (IConnected):**
```typescript
{
  /** Validated token claims */
  claims: ITokenClaims;

  /** Server-assigned client identifier */
  clientId: string;

  /** Document pre-existed (always true for connections) */
  existing: boolean;

  /** Maximum message size in bytes */
  maxMessageSize: number;

  /** Actual connection mode granted */
  mode: "write" | "read";

  /** Service configuration */
  serviceConfiguration: {
    blockSize: number;
    maxMessageSize: number;
    noopTimeFrequency?: number;
    noopCountFrequency?: number;
  };

  /** Currently connected clients */
  initialClients: Array<{
    clientId: string;
    client: IClient;
    clientConnectionNumber?: number;
    referenceSequenceNumber?: number;
  }>;

  /** Initial messages (typically empty) */
  initialMessages: ISequencedDocumentMessage[];

  /** Initial signals (typically empty) */
  initialSignals: ISignalMessage[];

  /** Server-supported protocol versions */
  supportedVersions: string[];

  /** Server-supported features */
  supportedFeatures: {
    submit_signals_v2?: boolean;
    // Additional features
  };

  /** Negotiated protocol version */
  version: string;

  /** Connection timestamp */
  timestamp?: number;

  /** Last known sequence number */
  checkpointSequenceNumber?: number;

  /** Document epoch */
  epoch?: string;

  /** Server environment info */
  relayServiceAgent?: string;
}
```

### 7.5 connect_document_error Event

Sent by server when connection fails.

**Event Name:** `connect_document_error`

**Payload:**
```typescript
{
  code: number;       // HTTP-style status code
  message: string;    // Error description
}
```

**Common Error Codes:**
| Code | Description |
|------|-------------|
| 400 | Invalid connection message |
| 403 | Invalid/missing token, access denied |
| 404 | Document not found |
| 429 | Too many clients connected |
| 500 | Internal server error |
| 503 | Server unavailable (draining) |

---

## 8. WebSocket Protocol: Operations

### 8.1 submitOp Event (Client → Server)

Submits operations to be sequenced.

**Event Name:** `submitOp`

**Parameters:**
1. `clientId: string` - The client's assigned ID
2. `messageBatches: (IDocumentMessage | IDocumentMessage[])[]` - Operations to submit

**IDocumentMessage Structure:**
```typescript
{
  /** Client-assigned sequence number (monotonically increasing per client) */
  clientSequenceNumber: number;

  /** Sequence number client had received when creating this op */
  referenceSequenceNumber: number;

  /** Operation type */
  type: string;

  /** Operation payload */
  contents: unknown;

  /** Application metadata */
  metadata?: unknown;

  /** Server metadata */
  serverMetadata?: unknown;

  /** Latency trace points */
  traces?: Array<{
    service: string;
    action: string;
    timestamp: number;
  }>;

  /** Compression algorithm used */
  compression?: string;
}
```

**Validation:**
- Client MUST have write mode connection
- Client MUST have `doc:write` scope
- Message size MUST NOT exceed `maxMessageSize`
- `clientSequenceNumber` MUST be monotonically increasing

### 8.2 op Event (Server → Clients)

Broadcasts sequenced operations to all connected clients.

**Event Name:** `op`

**Payload:**
```typescript
{
  /** Sender's document ID (redundant but included for compatibility) */
  documentId: string;

  /** Array of sequenced operations */
  op: ISequencedDocumentMessage[];
}
```

**ISequencedDocumentMessage Structure:**
```typescript
{
  /** Client ID that submitted this op (null for system messages) */
  clientId: string | null;

  /** Server-assigned sequence number (global total order) */
  sequenceNumber: number;

  /** Minimum sequence number at time of sequencing */
  minimumSequenceNumber: number;

  /** Client's sequence number for this op */
  clientSequenceNumber: number;

  /** Client's reference sequence number */
  referenceSequenceNumber: number;

  /** Operation type */
  type: string;

  /** Operation payload */
  contents: unknown;

  /** Application metadata */
  metadata?: unknown;

  /** Server metadata */
  serverMetadata?: unknown;

  /** Branch origin (if applicable) */
  origin?: {
    id: string;
    sequenceNumber: number;
    minimumSequenceNumber: number;
  };

  /** Latency traces */
  traces?: ITrace[];

  /** Server timestamp (milliseconds since epoch) */
  timestamp: number;

  /** Server-provided data (system messages only) */
  data?: string;
}
```

---

## 9. WebSocket Protocol: Signals

Signals are ephemeral messages broadcast to connected clients. Unlike operations, signals are NOT sequenced or persisted.

### 9.1 submitSignal Event (Client → Server)

**Event Name:** `submitSignal`

**Parameters:**
1. `clientId: string` - The client's assigned ID
2. `contentBatches: unknown[]` - Signal messages to broadcast

#### 9.1.1 Signal Format v1 (Legacy)

Content batches contain JSON-stringified envelope objects:
```typescript
JSON.stringify({
  address: string;
  contents: {
    type: string;
    content: unknown;
  };
  clientBroadcastSignalSequenceNumber: number;
})
```

#### 9.1.2 Signal Format v2 (Current)

Requires `supportedFeatures.submit_signals_v2 = true` on both client and server.

Content batches contain ISentSignalMessage objects:
```typescript
{
  /** Signal payload */
  content: unknown;

  /** Signal type */
  type?: string;

  /** Client-assigned signal counter */
  clientConnectionNumber?: number;

  /** Sequence number for ordering context */
  referenceSequenceNumber?: number;

  /** Target specific client (optional; broadcasts to all if omitted) */
  targetClientId?: string;
}
```

### 9.2 signal Event (Server → Clients)

**Event Name:** `signal`

**Payload (ISignalMessage):**
```typescript
{
  /** Sending client ID (null for server-generated signals) */
  clientId: string | null;

  /** Signal content */
  content: unknown;

  /** Signal type */
  type?: string;

  /** Signal counter */
  clientConnectionNumber?: number;

  /** Sequence context */
  referenceSequenceNumber?: number;

  /** Target client (if targeted) */
  targetClientId?: string;
}
```

### 9.3 System Signals

The server emits system signals for client join/leave events:

**ClientJoin Signal:**
```typescript
{
  clientId: null,
  content: JSON.stringify({
    type: "join",
    content: {
      clientId: string;
      client: IClient;
    }
  })
}
```

**ClientLeave Signal:**
```typescript
{
  clientId: null,
  content: JSON.stringify({
    type: "leave",
    content: string  // Departing client's ID
  })
}
```

---

## 10. WebSocket Protocol: Errors

### 10.1 nack Event

Sent by server when an operation or signal is rejected.

**Event Name:** `nack`

**Parameters:**
1. `clientId: string` - Empty string (legacy)
2. `nacks: INack[]` - Array of nack messages

**INack Structure:**
```typescript
{
  /** The rejected operation (may be undefined) */
  operation: IDocumentMessage | undefined;

  /** Sequence number to catch up to (-1 for non-op nacks) */
  sequenceNumber: number;

  /** Error details */
  content: {
    /** HTTP-style error code */
    code: number;

    /** Error type classification */
    type: NackErrorType;

    /** Human-readable error message */
    message: string;

    /** Seconds to wait before retry (throttling only) */
    retryAfter?: number;
  };
}
```

### 10.2 NackErrorType

```typescript
enum NackErrorType {
  /** Rate limit exceeded; retry after retryAfter seconds */
  ThrottlingError = "ThrottlingError",

  /** Token lacks required scope; obtain new token */
  InvalidScopeError = "InvalidScopeError",

  /** Malformed request; fix and retry immediately */
  BadRequestError = "BadRequestError",

  /** Server limit exceeded; do not retry */
  LimitExceededError = "LimitExceededError"
}
```

### 10.3 Common Nack Scenarios

| Scenario | Code | Type | Retryable |
|----------|------|------|-----------|
| Invalid message format | 400 | BadRequestError | Yes (after fix) |
| Read-only client submitting op | 400 | BadRequestError | No |
| Missing write scope | 403 | InvalidScopeError | No |
| Op size exceeds limit | 413 | BadRequestError | Yes (after fix) |
| Rate limit exceeded | 429 | ThrottlingError | Yes (after delay) |
| Server overloaded | 429 | LimitExceededError | No |

---

## 11. Sequence Number Semantics

### 11.1 Sequence Number Types

| Property | Assigned By | Scope | Purpose |
|----------|-------------|-------|---------|
| `clientSequenceNumber` | Client | Per-client | Order ops from same client |
| `sequenceNumber` | Server | Global | Total ordering of all ops |
| `referenceSequenceNumber` | Client | Global | Causal dependency marker |
| `minimumSequenceNumber` | Server | Global | Convergence watermark |

### 11.2 Client Sequence Number (CSN)

- MUST be monotonically increasing per client
- MUST start at 1 for the first operation
- Used to detect duplicate or out-of-order submissions
- Server MAY reject ops with non-increasing CSN

### 11.3 Sequence Number (SN)

- Assigned by the ordering service
- Globally monotonically increasing across all clients
- Defines the total order of operations
- First operation in a new document has SN = 1

### 11.4 Reference Sequence Number (RSN)

- Set by client to the highest SN received before creating the op
- Indicates causal dependency: this op was created with knowledge of all ops up to RSN
- Used for operational transform calculations

### 11.5 Minimum Sequence Number (MSN)

The MSN represents the convergence watermark - all clients have acknowledged processing ops up to this point.

**MSN Calculation Algorithm:**

```
MSN = min(
  min(RSN of all pending ops from connected clients),
  min(last known RSN of all connected clients)
)
```

**MSN Properties:**
- MSN can only increase (never decrease)
- MSN ≤ SN of most recent op
- When all clients have same RSN, MSN = that RSN
- Ops with SN ≤ MSN are eligible for garbage collection

**MSN Updates:**
- Server recalculates MSN when:
  - New op is sequenced
  - Client joins (uses join op's RSN)
  - Client leaves (removes from calculation)
  - Client sends NoOp (updates their RSN)

---

## 12. Summary Protocol

Summaries capture point-in-time snapshots of document state for efficient loading.

### 12.1 Summary Tree Structure

```typescript
interface ISummaryTree {
  type: 1;  // SummaryType.Tree

  /** Child nodes keyed by path segment */
  tree: {
    [path: string]: ISummaryTree | ISummaryBlob | ISummaryHandle | ISummaryAttachment;
  };

  /** True if this tree is unreferenced (eligible for GC) */
  unreferenced?: true;

  /** Loading group identifier */
  groupId?: string;
}

interface ISummaryBlob {
  type: 2;  // SummaryType.Blob
  content: string | Uint8Array;
}

interface ISummaryHandle {
  type: 3;  // SummaryType.Handle
  handleType: 1 | 2 | 4;  // Tree, Blob, or Attachment
  handle: string;  // Path to reuse from previous summary
}

interface ISummaryAttachment {
  type: 4;  // SummaryType.Attachment
  id: string;  // ID of externally uploaded blob
}
```

### 12.2 Summary Upload Flow

```
Client                                          Server
   │                                               │
   │  1. Upload blobs via Git Storage API          │
   │──────── POST /repos/:tenant/git/blobs ──────>│
   │<─────── { sha: "blob1" } ────────────────────│
   │                                               │
   │  2. Create tree referencing blobs             │
   │──────── POST /repos/:tenant/git/trees ──────>│
   │<─────── { sha: "tree1" } ────────────────────│
   │                                               │
   │  3. Create commit pointing to tree            │
   │──────── POST /repos/:tenant/git/commits ────>│
   │<─────── { sha: "commit1" } ──────────────────│
   │                                               │
   │  4. Submit summarize op via WebSocket         │
   │──────── submitOp (type: "summarize") ───────>│
   │                                               │
   │  5. Server validates and stores               │
   │                                               │
   │  6. Receive SummaryAck or SummaryNack         │
   │<─────── op (type: "summaryAck") ─────────────│
   │         OR                                    │
   │<─────── op (type: "summaryNack") ────────────│
   │                                               │
```

### 12.3 Summarize Message

```typescript
{
  type: "summarize";
  contents: {
    handle: string;      // Reference to uploaded summary
    message: string;     // Summary description
    parents: string[];   // Parent summary handles
    head: string;        // Current head reference
    details?: {
      includesProtocolTree?: boolean;
    };
  };
}
```

### 12.4 Summary Acknowledgment

**SummaryAck:**
```typescript
{
  type: "summaryAck";
  contents: {
    handle: string;  // Final summary handle
    summaryProposal: {
      summarySequenceNumber: number;
    };
  };
}
```

**SummaryNack:**
```typescript
{
  type: "summaryNack";
  contents: {
    summaryProposal: {
      summarySequenceNumber: number;
    };
    code?: number;
    message?: string;
    retryAfter?: number;
  };
}
```

---

## 13. Quorum & Consensus

### 13.1 Client Tracking

The server maintains a quorum of connected clients:

**Join Message (type: "join"):**
```typescript
{
  type: "join";
  contents: null;
  data: JSON.stringify({
    clientId: string;
    detail: IClient;
  });
}
```

**Leave Message (type: "leave"):**
```typescript
{
  type: "leave";
  contents: null;
  data: JSON.stringify(clientId);
}
```

### 13.2 Proposal System

Quorum proposals allow clients to agree on configuration values:

**Propose Message:**
```typescript
{
  type: "propose";
  contents: {
    key: string;
    value: unknown;
  };
}
```

**Proposal Lifecycle:**
1. Client submits proposal
2. Proposal is sequenced
3. If no rejections received before MSN >= proposal SN, proposal is approved
4. Value becomes committed when MSN advances past approval

### 13.3 Implicit Consensus

Consensus is achieved implicitly through MSN advancement:
- A proposal is approved when MSN >= proposal's sequence number
- This indicates all clients have seen the proposal and none rejected it
- Committed proposals are stored in quorum values

---

## 14. Feature Negotiation

### 14.1 Feature Exchange

Features are negotiated during connection:

**Client → Server (in IConnect):**
```typescript
{
  supportedFeatures: {
    feature_name: true | false | value
  }
}
```

**Server → Client (in IConnected):**
```typescript
{
  supportedFeatures: {
    feature_name: true | false | value
  }
}
```

### 14.2 Known Features

| Feature | Description |
|---------|-------------|
| `submit_signals_v2` | Enables v2 signal format with targeting |

### 14.3 Feature Compatibility

- Features are opt-in; unknown features SHOULD be ignored
- Feature behavior MUST be compatible when both parties support it
- Servers SHOULD advertise all supported features
- Clients MAY use features only when server confirms support

---

## 15. Security Considerations

### 15.1 Transport Security

- All communications MUST use TLS 1.2 or higher
- WebSocket connections MUST use `wss://` protocol
- HTTP endpoints MUST use `https://`

### 15.2 Input Validation

Servers MUST validate:
- All JSON payloads against expected schemas
- String lengths to prevent memory exhaustion
- Operation sizes against configured limits
- Sequence numbers for consistency
- Tenant/document IDs against token claims

### 15.3 Rate Limiting

Servers SHOULD implement rate limiting:
- Per-tenant connection limits
- Per-client operation submission limits
- Per-client signal submission limits
- Global cluster limits

### 15.4 Token Security

- Tokens SHOULD have short expiration times (< 1 hour)
- Token refresh SHOULD occur before expiration
- Revoked tokens MUST be rejected immediately
- Token validation MUST verify all claims

---

## Appendix A: TypeScript Interfaces

### IUser
```typescript
interface IUser {
  id: string;
  [key: string]: unknown;
}
```

### IClient
```typescript
interface IClient {
  mode: "write" | "read";
  details: {
    capabilities: { interactive: boolean };
    type?: string;
    environment?: string;
    device?: string;
  };
  permission: string[];
  user: IUser;
  scopes: string[];
  timestamp?: number;
}
```

### ISequencedClient
```typescript
interface ISequencedClient {
  client: IClient;
  sequenceNumber: number;
}
```

### ISignalClient
```typescript
interface ISignalClient {
  clientId: string;
  client: IClient;
  clientConnectionNumber?: number;
  referenceSequenceNumber?: number;
}
```

### IClientConfiguration
```typescript
interface IClientConfiguration {
  maxMessageSize: number;
  blockSize: number;
  noopTimeFrequency?: number;
  noopCountFrequency?: number;
}
```

### ITrace
```typescript
interface ITrace {
  service: string;
  action: string;
  timestamp: number;
}
```

---

## Appendix B: MessageType Enumeration

```typescript
enum MessageType {
  /** Empty operation for reference number updates */
  NoOp = "noop",

  /** System: client joined */
  ClientJoin = "join",

  /** System: client left */
  ClientLeave = "leave",

  /** Quorum: propose new value */
  Propose = "propose",

  /** Quorum: reject proposal */
  Reject = "reject",

  /** Quorum: accept proposal (unused) */
  Accept = "accept",

  /** Summary submission */
  Summarize = "summarize",

  /** Summary accepted */
  SummaryAck = "summaryAck",

  /** Summary rejected */
  SummaryNack = "summaryNack",

  /** Container runtime operation */
  Operation = "op",

  /** System: no clients connected */
  NoClient = "noClient",

  /** Diagnostic: round-trip complete */
  RoundTrip = "tripComplete",

  /** Non-sequenced control message */
  Control = "control"
}
```

---

*End of Specification*
