---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add application-defined schema versions

SharedTree supports optional application-defined schema versions.
These versions are provided as a version map, where each version is keyed by a stable, globally unique [`LibraryId`](https://fluidframework.com/docs/api/fluid-framework/libraryid-typealias).
This allows an application to have separate versions for different features, components, or libraries.
For example, a notes feature and a comments feature can each track changes to their part of the schema without sharing a single application-wide version.

[`identifySchema`](https://fluidframework.com/docs/api/fluid-framework/identifyschema-function) accepts the version map in its `schemaVersion` option.
The result is passed to the `schemaIdentity` option of [`TreeViewConfigurationAlpha`](https://fluidframework.com/docs/api/fluid-framework/treeviewconfigurationalpha-class).
Storing versions requires the experimental schema format, enabled through [`configuredSharedTreeAlpha`](https://fluidframework.com/docs/api/fluid-framework/configuredsharedtreealpha-function).
The example below configures separate versions for notes and comments:

```typescript
import {
	configuredSharedTreeAlpha,
	identifySchema,
	type LibraryId,
	SchemaFactory,
	TreeViewConfigurationAlpha,
} from "fluid-framework/alpha";

const schemaFactory = new SchemaFactory("com.example");
const notesId = "com.example.notes" as LibraryId;
const commentsId = "com.example.comments" as LibraryId;
class AppSchema extends schemaFactory.object("App", {
	notes: schemaFactory.array("Notes", schemaFactory.string),
	comments: schemaFactory.array("Comments", schemaFactory.string),
}) {}

const SharedTree = configuredSharedTreeAlpha({
	allowPossiblyIncompatibleWriteVersionOverrides: true,
	writeVersionOverrides: new Map([["Schema", "schemaVersion"]]),
});

const config = new TreeViewConfigurationAlpha({
	schema: AppSchema,
	schemaIdentity: identifySchema({
		schemaVersion: {
			[notesId]: 3,
			[commentsId]: 1,
		},
	}),
});
```

If a later release changes the notes schema but leaves comments unchanged, the notes version can increase from `3` to `4` while the comments version stays at `1`.
This records which feature's schema changed without assigning a new version to every feature in the application.

[`TreeViewAlpha`](https://fluidframework.com/docs/api/fluid-framework/treeviewalpha-interface) exposes two version maps:

- `schemaVersion` contains the versions configured by the application.
- `storedSchemaVersion` contains the versions stored in the document.
  This property is also available on [`ITreeAlpha`](https://fluidframework.com/docs/api/fluid-framework/itreealpha-interface).

Comparing these maps can help explain a schema compatibility issue.
For example, the application might expect notes version `4` while the document stores version `3`.
If both use comments version `1`, the notes schema is a useful starting point for investigation.
The version numbers identify schema revisions, but compatibility checks still determine whether the document can be viewed or upgraded.

[`exportCompatibilitySchemaSnapshot`](https://fluidframework.com/docs/api/fluid-framework/exportcompatibilityschemasnapshot-function) also includes the version map, so snapshots track feature versions alongside schema changes.

Application-defined versions have the following constraints:

- Version numbers must be non-negative safe integers, and library identifiers must remain stable across releases.
- Stored versions cannot decrease, and existing library identifiers cannot be removed from the map.
- Until the stored format is stable, all clients that load or collaborate on a versioned document must use the same Fluid Framework version.
