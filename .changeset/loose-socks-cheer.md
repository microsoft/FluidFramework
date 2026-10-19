---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add application-defined schema versions to SharedTree

SharedTree supports optional application-defined schema versions.
Pass versions to [`identifySchema`][identify-schema].
Set the returned [`SchemaIdentity`][schema-identity] on
[`TreeViewConfigurationAlpha`][view-configuration].
Use a [`SchemaVersionMap`][version-map] to give each library or component its own version.
Each entry has a [`LibraryId`][library-id] key and a non-negative safe integer value.
Use a globally unique library identifier, such as a package name or a domain-based name.
The identifier is stored in documents and must stay the same across releases.

By default, schema upgrades must keep existing documents valid and cannot be reversed.
After application versions are stored, you can make other changes that keep documents valid.
For these changes, increase at least one version.
Stored versions cannot decrease, and library identifiers cannot be removed.
This prevents older applications from reversing a newer application's schema change.
For changes allowed by the default upgrade rules, a version increase is optional.
You can still increase a version to identify schemas in telemetry and compatibility snapshots.

To store a metadata-only change, increase at least one application version.
At the same versions, a metadata-only change does not update the stored schema.

Schema versions use an experimental stored schema format.
Until the format is stable, all clients that load or collaborate on the document
must use the same Fluid Framework version.
Use [`configuredSharedTreeAlpha`][configured-tree] to select this format, as shown below.

For example, a required string field and an identifier field accept the same stored values.
Increase the application version to change a required string field to an identifier field:

```typescript
import {
	configuredSharedTreeAlpha,
	identifySchema,
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
	schemaIdentity: identifySchema({ schemaVersion: { [libraryId]: 0 } }),
});
const newConfig = new TreeViewConfigurationAlpha({
	schema: schemaFactory.identifier,
	schemaIdentity: identifySchema({ schemaVersion: { [libraryId]: 1 } }),
});
```

Read the configured and stored versions from [`TreeViewAlpha`][tree-view].
Read stored versions from [`ITreeAlpha`][tree].
[`exportCompatibilitySchemaSnapshot`][snapshot-export] includes the configured version map.
Snapshots with a version map use snapshot v2.
Without a version map, snapshots continue to use v1.

[view-configuration]: https://fluidframework.com/docs/api/fluid-framework/treeviewconfigurationalpha-class
[version-map]: https://fluidframework.com/docs/api/fluid-framework/schemaversionmap-typealias
[library-id]: https://fluidframework.com/docs/api/fluid-framework/libraryid-typealias
[configured-tree]: https://fluidframework.com/docs/api/fluid-framework/configuredsharedtreealpha-function
[tree-view]: https://fluidframework.com/docs/api/fluid-framework/treeviewalpha-interface
[tree]: https://fluidframework.com/docs/api/fluid-framework/itreealpha-interface
[snapshot-export]: https://fluidframework.com/docs/api/fluid-framework/exportcompatibilityschemasnapshot-function
[identify-schema]: https://fluidframework.com/docs/api/fluid-framework/identifyschema-function
[schema-identity]: https://fluidframework.com/docs/api/fluid-framework/schemaidentity-interface
