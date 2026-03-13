# JSON Schema Definitions

This directory contains JSON Schema (draft 2020-12) definitions for all Fluid Framework protocol message types.

## Schema Files

| File | Description |
|------|-------------|
| [token-claims.schema.json](./token-claims.schema.json) | JWT token claims structure |
| [connect.schema.json](./connect.schema.json) | Client connection request (IConnect) |
| [connected.schema.json](./connected.schema.json) | Server connection response (IConnected) |
| [document-message.schema.json](./document-message.schema.json) | Unsequenced operation (IDocumentMessage) |
| [sequenced-document-message.schema.json](./sequenced-document-message.schema.json) | Sequenced operation (ISequencedDocumentMessage) |
| [signal-message.schema.json](./signal-message.schema.json) | Signal message (ISignalMessage) |
| [nack.schema.json](./nack.schema.json) | Error/rejection message (INack) |
| [summary-tree.schema.json](./summary-tree.schema.json) | Summary tree structure (ISummaryTree) |

## Usage

### JavaScript/TypeScript (Ajv)

```typescript
import Ajv from "ajv/dist/2020";
import connectSchema from "./connect.schema.json";

const ajv = new Ajv();
const validate = ajv.compile(connectSchema);

const message = {
  tenantId: "tenant-abc",
  id: "doc-123",
  // ...
};

if (validate(message)) {
  // Message is valid
} else {
  console.error(validate.errors);
}
```

### Python (jsonschema)

```python
import json
from jsonschema import validate, Draft202012Validator

with open("connect.schema.json") as f:
    schema = json.load(f)

message = {
    "tenantId": "tenant-abc",
    "id": "doc-123",
    # ...
}

validate(instance=message, schema=schema, cls=Draft202012Validator)
```

### Go (gojsonschema)

```go
import "github.com/xeipuuv/gojsonschema"

schemaLoader := gojsonschema.NewReferenceLoader("file:///path/to/connect.schema.json")
documentLoader := gojsonschema.NewGoLoader(message)

result, err := gojsonschema.Validate(schemaLoader, documentLoader)
if result.Valid() {
    // Message is valid
}
```

## Schema References

Some schemas reference other schemas using `$ref`. When validating, ensure all referenced schemas are available to the validator.

Referenced schemas:
- `connected.schema.json` references `token-claims.schema.json`
- `connected.schema.json` references `sequenced-document-message.schema.json`
- `connected.schema.json` references `signal-message.schema.json`
- `nack.schema.json` references `document-message.schema.json`

## Validation Notes

1. **Additional Properties**: Most schemas allow additional properties for forward compatibility
2. **Nullable Fields**: Use `["string", "null"]` type for nullable strings
3. **Enums**: Message types and error types are validated against known values
4. **Required Fields**: Only truly required fields are marked as required; optional fields support protocol evolution
