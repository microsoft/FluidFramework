---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add application-defined schema versions to SharedTree

SharedTree now supports optional application-defined schema versions through [`TreeViewConfigurationAlpha`](https://fluidframework.com/docs/api/fluid-framework/treeviewconfigurationalpha-class).
Version maps use non-negative safe integers keyed by [`LibraryId`](https://fluidframework.com/docs/api/fluid-framework/libraryid-typealias), allowing each library or component to manage its own version.
Library identifiers are persisted and must be stable, globally unique, and namespaced, such as a package name or domain-based name.

Increasing a version is required when a schema change keeps every existing document valid but does not only expand what may be stored.
Existing versions cannot decrease or be removed.
This prevents older applications from reversing the change and repeatedly conflicting with newer applications.
For changes that only expand what may be stored, increasing a version is optional but can still be useful for identifying application schema revisions in telemetry and compatibility snapshots.
Versioned schemas use an experimental persisted format.
Every client that loads or collaborates on a versioned document must use the same Fluid Framework version until this format is stabilized.
Applications using schema versions must configure SharedTree to write the experimental schema format:

For example, changing a required string field to an identifier field is not normally allowed.
Both fields accept the same stored values, so increasing the application version allows it:

```typescript
import {
	configuredSharedTreeAlpha,
	type LibraryId,
	SchemaFactory,
	TreeViewConfigurationAlpha,
} from "fluid-framework/alpha";

const schemaFactory = new SchemaFactory("com.example");
const libraryId = "com.example" as LibraryId;
const SharedTree = configuredSharedTreeAlpha({
	allowPossiblyIncompatibleWriteVersionOverrides: true,
	writeVersionOverrides: new Map([["Schema", "schemaVersion"]]),
});

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
