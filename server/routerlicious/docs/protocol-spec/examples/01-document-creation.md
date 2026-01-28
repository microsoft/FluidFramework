# Example: Document Creation Flow

This example demonstrates creating a new Fluid document with an initial summary.

## Prerequisites

- Valid tenant ID: `tenant-abc`
- JWT token with scopes: `["doc:read", "doc:write"]`

## Step 1: Generate JWT Token

The application server generates a JWT token:

```json
{
  "documentId": "new-document-id",
  "scopes": ["doc:read", "doc:write"],
  "tenantId": "tenant-abc",
  "user": {
    "id": "user-123",
    "name": "Alice"
  },
  "iat": 1706180400,
  "exp": 1706184000,
  "ver": "1.0"
}
```

Sign with tenant secret to produce JWT.

## Step 2: Create Initial Summary Tree

Build the initial summary structure:

```json
{
  "type": 1,
  "tree": {
    ".protocol": {
      "type": 1,
      "tree": {
        "attributes": {
          "type": 2,
          "content": "{\"sequenceNumber\":0,\"minimumSequenceNumber\":0}"
        },
        "quorumMembers": {
          "type": 2,
          "content": "[]"
        },
        "quorumProposals": {
          "type": 2,
          "content": "[]"
        },
        "quorumValues": {
          "type": 2,
          "content": "[[\"code\",{\"key\":\"code\",\"value\":{\"package\":\"@fluid-example/app\"},\"approvalSequenceNumber\":0,\"commitSequenceNumber\":0,\"sequenceNumber\":0}]]"
        }
      }
    },
    ".app": {
      "type": 1,
      "tree": {
        ".channels": {
          "type": 1,
          "tree": {
            "root": {
              "type": 1,
              "tree": {
                ".component": {
                  "type": 2,
                  "content": "{\"pkg\":\"@fluid-example/shared-map\"}"
                },
                ".channels": {
                  "type": 1,
                  "tree": {
                    "root": {
                      "type": 1,
                      "tree": {
                        "header": {
                          "type": 2,
                          "content": "{\"type\":\"https://graph.microsoft.com/types/map\"}"
                        },
                        "content": {
                          "type": 2,
                          "content": "{}"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## Step 3: HTTP Request - Create Document

**Request:**
```http
POST /documents/tenant-abc HTTP/1.1
Host: fluid-server.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "id": "doc-12345",
  "summary": {
    "type": 1,
    "tree": {
      ".protocol": {
        "type": 1,
        "tree": {
          "attributes": {
            "type": 2,
            "content": "{\"sequenceNumber\":0,\"minimumSequenceNumber\":0}"
          },
          "quorumMembers": {
            "type": 2,
            "content": "[]"
          },
          "quorumProposals": {
            "type": 2,
            "content": "[]"
          },
          "quorumValues": {
            "type": 2,
            "content": "[]"
          }
        }
      },
      ".app": {
        "type": 1,
        "tree": {}
      }
    }
  },
  "sequenceNumber": 0,
  "values": []
}
```

**Response (201 Created):**
```http
HTTP/1.1 201 Created
Content-Type: application/json

"doc-12345"
```

## Step 4: Alternative - Create with Session Discovery

**Request:**
```http
POST /documents/tenant-abc HTTP/1.1
Host: fluid-server.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "summary": { ... },
  "sequenceNumber": 0,
  "values": [],
  "generateToken": true,
  "enableDiscovery": true
}
```

**Response (201 Created):**
```json
{
  "id": "doc-auto-generated-uuid",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "session": {
    "ordererUrl": "wss://fluid-server.example.com",
    "historianUrl": "https://fluid-server.example.com",
    "deltaStreamUrl": "wss://fluid-server.example.com",
    "isSessionAlive": false,
    "isSessionActive": false
  }
}
```

## Server Processing

1. Validate JWT token signature and claims
2. Check `doc:write` scope present
3. Generate document ID if not provided
4. Convert summary tree to git objects:
   - Create blobs for all leaf nodes
   - Create trees for all tree nodes
   - Create commit pointing to root tree
   - Create ref `refs/heads/main` pointing to commit
5. Store document metadata with initial sequence number
6. Return document ID

## Error Scenarios

**Invalid Token (400):**
```json
{
  "error": "Invalid token",
  "code": 400
}
```

**Missing Write Scope (403):**
```json
{
  "error": "Insufficient permissions",
  "code": 403
}
```

**Server Draining (503):**
```json
{
  "error": "Service unavailable",
  "code": 503
}
```
