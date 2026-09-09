---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add application-defined schema versions to SharedTree

SharedTree now supports optional application-defined schema versions through [`TreeViewConfigurationAlpha`](https://fluidframework.com/docs/api/fluid-framework/treeviewconfigurationalpha-class).
Version maps use non-negative integers keyed by [`LibraryId`](https://fluidframework.com/docs/api/fluid-framework/libraryid-typealias), allowing each library or component to manage its own version.

Versions allow a schema change when existing documents remain valid and at least one version increases.
Existing versions cannot decrease or be removed.
This prevents older applications from reversing the change and repeatedly conflicting with newer applications.
Versioned schemas use an experimental persisted format.

For example, changing a required string field to an identifier field is not normally allowed.
Both fields accept the same stored values, so increasing the application version allows it:

```typescript
import { type LibraryId, SchemaFactory, TreeViewConfigurationAlpha } from "fluid-framework/alpha";

const schemaFactory = new SchemaFactory("com.example");
const libraryId = "com.example" as LibraryId;

const oldConfig = new TreeViewConfigurationAlpha({
	schema: schemaFactory.string,
	schemaVersion: { [libraryId]: 0 },
});
const newConfig = new TreeViewConfigurationAlpha({
	schema: schemaFactory.identifier,
	schemaVersion: { [libraryId]: 1 },
});
```

The configured and stored versions are available from [`TreeViewAlpha`](https://fluidframework.com/docs/api/fluid-framework/treeviewalpha-interface), and the stored versions are also available from [`ITreeAlpha`](https://fluidframework.com/docs/api/fluid-framework/itreealpha-interface).
Schema compatibility snapshots now include the configured version map.
