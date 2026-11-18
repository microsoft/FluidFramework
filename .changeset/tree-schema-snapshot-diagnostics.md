---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Schema compatibility snapshot errors explain viewing and upgrade failures

Errors from [`snapshotSchemaCompatibility`](https://fluidframework.com/docs/api/tree#snapshotschemacompatibility-function) now include the diagnostic reasons for each failed comparison with a historical schema.
The messages identify affected fields and node types, and preserve nested viewing reasons when a proposed schema upgrade would still prevent viewing.
Compatibility requirements and snapshot update behavior are unchanged.

The following examples assume snapshots for versions `1.0.0` and `2.0.0` already exist and the latest snapshot matches the current schema.
The snapshot directory is illustrative.

### Historical clients cannot view the current schema

Suppose version `1.0.0` allows only a number at the root, while version `2.0.0` allows a number or a string.
With `minVersionForCollaboration: "1.0.0"`, the check fails because historical clients cannot handle the newly allowed strings:

```text
Schema compatibility check failed:
 - Historical version "1.0.0" cannot view documents from "2.0.0": these versions are expected to be able to collaborate due to the selected `minVersionForCollaboration` "1.0.0".
   - Cannot view the root field: the stored schema allows node types ["com.fluidframework.leaf.string"], which the view does not allow.
Snapshots in: "/app/schema-snapshots"
Snapshots exist for versions: [
	"1.0.0",
	"2.0.0"
].
```

### The current schema cannot upgrade historical documents

Now suppose version `1.0.0` allows a number or a string at the root, but version `2.0.0` removes string support.
Even with `minVersionForCollaboration: "2.0.0"`, the current schema must still support historical documents.
The proposed upgrade preserves their allowed string values, but the current view cannot handle them, so the error includes the nested viewing reason:

```text
Schema compatibility check failed:
 - Current version "2.0.0" cannot upgrade documents from "1.0.0".
   - Cannot upgrade: the resulting stored schema would still prevent the view from reading or writing the document.
     - Cannot view the root field: the stored schema allows node types ["com.fluidframework.leaf.string"], which the view does not allow.
Snapshots in: "/app/schema-snapshots"
Snapshots exist for versions: [
	"1.0.0",
	"2.0.0"
].
```
