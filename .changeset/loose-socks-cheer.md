---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add an experimental preview of application-defined schema versions

As your application evolves, different parts of its schema may change at different times.
Application-defined schema versions let you use a single application-wide number, versions for schema libraries you compose together, or both.
You choose which versions to use, but they must not decrease across schema upgrades.

**Experimental preview: Do not use the experimental stored-schema format in production applications.**
Setting `allowPossiblyIncompatibleWriteVersionOverrides` to `true` allows the override to write a format that can break collaboration with client versions your application supports.
The experimental format will not be supported long term.
Documents written with this format are not guaranteed to remain readable by future Fluid Framework versions.

To define schema versions, choose a stable, globally unique string identifier for each part of the schema and use those identifiers as the keys in a version map.
Use a package name or a domain-based name to avoid conflicts with other libraries.
Each version is a non-negative safe integer.
Pass the map in the `schemaVersion` option of [`identifySchemaAlpha`](https://fluidframework.com/docs/api/fluid-framework/identifyschemaalpha-function), then pass the result to the [`schemaIdentity`](https://fluidframework.com/docs/api/fluid-framework/treeviewconfigurationalpha-class#schemaidentity-property) property of [`TreeViewConfigurationAlpha`](https://fluidframework.com/docs/api/fluid-framework/treeviewconfigurationalpha-class).
Because storing versions requires the experimental schema format, also enable it with [`configuredSharedTreeAlpha`](https://fluidframework.com/docs/api/fluid-framework/configuredsharedtreealpha-function).
To select the experimental stored-schema format, set `allowPossiblyIncompatibleWriteVersionOverrides` to `true` and add `["Schema", "schemaVersion"]` to `writeVersionOverrides`.
The following example configures separate schema versions for notes and comments stored as application data, not schema annotations or persisted metadata:

```typescript
import {
	configuredSharedTreeAlpha,
	identifySchemaAlpha,
	SchemaFactory,
	TreeViewConfigurationAlpha,
} from "fluid-framework/alpha";

const schemaFactory = new SchemaFactory("com.example");
const notes = "com.example.notes";
const comments = "com.example.comments";
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
	schemaIdentity: identifySchemaAlpha({
		schemaVersion: {
			[notes]: 3,
			[comments]: 1,
		},
	}),
});
```

Suppose the next release changes the notes schema but leaves comments unchanged.
Increase the notes version from `3` to `4` and keep the comments version at `1`.
The map then records which feature's schema changed without assigning a new version to the unchanged parts of the application.

#### Start with a single version

If your application only needs one version, you can start with a number instead of a map:

```typescript
const identity = identifySchemaAlpha({
	schemaVersion: 1,
});
```

The number is stored as the map `{ "schemaVersion": 1 }`.
Here, `"schemaVersion"` is an ordinary identifier, not a reserved one, and follows the same upgrade rules as any other library identifier.
If you later need separate feature versions, switch to a map that keeps this entry and adds identifiers for those features.

Separate identifiers are also useful for tracking experimental features.
For example, give an experimental library its own identifier so you can recognize documents it created, even after the experiment ends.

#### Add schema hashing when you need it

If you only need versions, use [`identifySchemaAlpha`](https://fluidframework.com/docs/api/fluid-framework/identifyschemaalpha-function).
It does not compute hashes or log hash telemetry, so bundles can omit the hashing implementation.
For hash telemetry as well as versions, use [`identifySchemaWithHashAlpha`](https://fluidframework.com/docs/api/fluid-framework/identifyschemawithhashalpha-function) instead.

You can also pass `expectedHash` to the hash-enabled factory to check the configured schema during view construction.
Versions are not included in the hash, so changing only the version map does not require a new `expectedHash`.

If you currently use [`identifySchemaAlpha`](https://fluidframework.com/docs/api/fluid-framework/identifyschemaalpha-function) for hash checks or telemetry, switch to [`identifySchemaWithHashAlpha`](https://fluidframework.com/docs/api/fluid-framework/identifyschemawithhashalpha-function).

#### Use versions to investigate compatibility

When investigating a schema compatibility issue, compare the versions your application expects with those stored in the document.
On [`TreeViewAlpha`](https://fluidframework.com/docs/api/fluid-framework/treeviewalpha-interface), read [`schemaVersion`](https://fluidframework.com/docs/api/fluid-framework/treeviewalpha-interface#schemaversion-property) for the configured versions and [`storedSchemaVersion`](https://fluidframework.com/docs/api/fluid-framework/treeviewalpha-interface#storedschemaversion-property) for the document's versions.
You can also read the stored versions through [`ViewableTreeAlpha.storedSchemaVersion`](https://fluidframework.com/docs/api/fluid-framework/viewabletreealpha-interface#storedschemaversion-property).

For example, the application might expect notes version `4` while the document stores version `3`.
If both still use comments version `1`, you have a useful starting point: investigate the notes schema first.
The versions help explain the difference, but use compatibility checks to determine whether the document can be viewed or upgraded.

You can also capture these versions alongside the schema by exporting the configuration with [`exportCompatibilitySchemaSnapshot`](https://fluidframework.com/docs/api/fluid-framework/exportcompatibilityschemasnapshot-function).

#### Keep upgrades consistent

As you update your schema, keep library identifiers stable and do not decrease stored versions or remove existing identifiers from the map.
Until the stored format is stable, use the same Fluid Framework version on all clients that load or collaborate on a versioned document.
