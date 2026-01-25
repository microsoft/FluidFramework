# Fluid Framework Server Protocol Specification

This specification defines the wire protocol for implementing a compliant Fluid Framework collaboration server. It enables implementation in any programming language that supports WebSocket (Socket.IO) and HTTP.

## Document Structure

| Document | Description |
|----------|-------------|
| [spec.md](./spec.md) | Complete protocol specification |
| [schemas/](./schemas/) | JSON Schema definitions for all message types |
| [examples/](./examples/) | Worked message flow examples with full JSON payloads |

## Quick Reference

### Service Components

A compliant Fluid server consists of three service components:

1. **Ordering Service** (WebSocket via Socket.IO) - Real-time operation sequencing
2. **Storage Service** (HTTP) - Document metadata and delta retrieval
3. **Git Storage Service** (HTTP) - Git-like blob/tree/commit storage for summaries

### Key Concepts

| Term | Description |
|------|-------------|
| **Document** | A collaborative data container identified by tenant + document ID |
| **Op** | An operation (mutation) submitted by a client |
| **Signal** | An ephemeral message broadcast to other clients (not persisted) |
| **Summary** | A point-in-time snapshot of document state |
| **MSN** | Minimum Sequence Number - convergence watermark |
| **Quorum** | Set of connected clients with consensus tracking |

### Protocol Versions

The server supports protocol versions: `^0.4.0`, `^0.3.0`, `^0.2.0`, `^0.1.0`

Clients provide preferred versions during connection; the server selects the first compatible version.

## Implementation Checklist

- [ ] HTTP endpoints for document create/get
- [ ] HTTP endpoints for delta retrieval
- [ ] HTTP endpoints for git-like storage (blobs, trees, commits, refs)
- [ ] WebSocket (Socket.IO) connection handling
- [ ] Operation sequencing and broadcast
- [ ] Signal routing (v1 and v2 formats)
- [ ] JWT token validation
- [ ] MSN calculation and tracking
- [ ] Summary storage and acknowledgment

## Reference Implementation

The reference implementation is [Tinylicious](https://github.com/microsoft/FluidFramework/tree/main/server/routerlicious/packages/tinylicious), a lightweight single-tenant Fluid server suitable for local development and testing.

## License

This specification is derived from the Microsoft Fluid Framework, licensed under the MIT License.
