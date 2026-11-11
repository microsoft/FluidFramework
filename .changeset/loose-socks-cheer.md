---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Experimental preview of application-defined schema versions

As an application evolves, different parts of its schema may change at different times.
Application-defined schema versions describe the schema with a single version number or multiple version numbers for different parts of the schema.
SharedTree stores these versions with the schema and uses them to order upgrades, so older application versions cannot undo a versioned upgrade.
The application controls version granularity, but the versions must not decrease across schema upgrades.

**Experimental preview: The experimental stored-schema format is not suitable for production applications.**
Persisting these versions currently requires an experimental format.
The configuration below explicitly overrides normal format selection and can therefore break collaboration with client versions the application supports.
The experimental format will not be supported long term, so documents written with it are not guaranteed to remain readable by future Fluid Framework versions.
For preview testing, every client that loads or collaborates on the document must use the same Fluid Framework version to avoid mixing implementations of the experimental format.
This constraint does not make the format suitable for production use.

#### Single application-wide version

An application that only needs one version can specify a non-negative safe integer in the `schemaVersion` option of [`identifySchemaAlpha`](https://fluidframework.com/docs/api/fluid-framework/identifyschemaalpha-function):

```typescript
const identity = identifySchemaAlpha({
	schemaVersion: 1,
});
```

The returned identity configures versioning through the [`schemaIdentity`](https://fluidframework.com/docs/api/fluid-framework/treeviewconfigurationalpha-class#schemaidentity-property) property of [`TreeViewConfigurationAlpha`](https://fluidframework.com/docs/api/fluid-framework/treeviewconfigurationalpha-class).
Persisting the version during document initialization or upgrade also requires [`configuredSharedTreeAlpha`](https://fluidframework.com/docs/api/fluid-framework/configuredsharedtreealpha-function) to use the experimental stored-schema format.
This configuration requires `allowPossiblyIncompatibleWriteVersionOverrides` to be `true` and `writeVersionOverrides` to include `["Schema", "schemaVersion"]`, as shown in the next example.

#### Independent versions for parts of the schema

When parts of a schema evolve independently, a version map can replace the single number.
Each key identifies a part of the schema, and its value is a non-negative safe integer.
Stable, globally unique string identifiers, such as package names or domain-based names, avoid conflicts with other libraries.

The following example defines notes and comments as application data and gives each node schema its own version.
It uses each schema's `identifier` as the map key and a static `version` property to keep the corresponding version near its schema definition.
These static properties are an application convention: SharedTree reads the map passed to `schemaVersion`, not the properties on the classes.

```typescript
import {
	configuredSharedTreeAlpha,
	identifySchemaAlpha,
	SchemaFactory,
	TreeViewConfigurationAlpha,
} from "fluid-framework/alpha";

const schemaFactory = new SchemaFactory("com.example");
class Note extends schemaFactory.object("Note", {
	id: schemaFactory.identifier,
	text: schemaFactory.string,
}) {
	static readonly version = 3;
}

class Comment extends schemaFactory.object("Comment", {
	id: schemaFactory.identifier,
	text: schemaFactory.string,
}) {
	static readonly version = 1;
}

class AppSchema extends schemaFactory.object("App", {
	notes: schemaFactory.array("Notes", Note),
	comments: schemaFactory.array("Comments", Comment),
}) {}

const SharedTree = configuredSharedTreeAlpha({
	allowPossiblyIncompatibleWriteVersionOverrides: true,
	writeVersionOverrides: new Map([["Schema", "schemaVersion"]]),
});

const config = new TreeViewConfigurationAlpha({
	schema: AppSchema,
	schemaIdentity: identifySchemaAlpha({
		schemaVersion: {
			[Note.identifier]: Note.version,
			[Comment.identifier]: Comment.version,
		},
	}),
});
```

In this example, the next release changes the notes schema but leaves comments unchanged.
That release increases `Note.version` from `3` to `4` while keeping `Comment.version` at `1`.
The map then records which feature's schema changed without assigning a new version to the unchanged parts of the application.

#### Consistent schema upgrades

An upgrade to an existing document must preserve its version identifiers and must not decrease their values.
These rules prevent an older application from reversing an upgrade made by a newer one.
Existing additive schema upgrades do not require a version increase.
To make a change outside those rules, both the stored and new schemas must have version maps, and at least one version must increase or a new identifier must be added.
Even then, the new schema must still accept all content allowed by the stored schema.
Adding a version map for the first time does not bypass the additive upgrade rules.

The single-number shorthand follows these same rules because SharedTree stores it as the map `{ "schemaVersion": 1 }`.
Here, `"schemaVersion"` is an ordinary identifier, not a reserved one.
If the application later adds feature versions, this entry must remain alongside the new identifiers rather than being replaced.
Its value can stay unchanged while only the feature versions increase.

#### Optional schema hashing

[`identifySchemaAlpha`](https://fluidframework.com/docs/api/fluid-framework/identifyschemaalpha-function) provides versions without hashing.
It does not compute hashes or log hash telemetry, so bundles can omit the hashing implementation.
[`identifySchemaWithHashAlpha`](https://fluidframework.com/docs/api/fluid-framework/identifyschemawithhashalpha-function) supports both hash telemetry and versions.

The hash-enabled factory also accepts `expectedHash` to check the configured schema during view construction.
Versions are not included in the hash, so changing only the version map does not require a new `expectedHash`.

Separating the version-only and hash-enabled factories is a breaking change for existing alpha API users who use [`identifySchemaAlpha`](https://fluidframework.com/docs/api/fluid-framework/identifyschemaalpha-function) for hash checks or telemetry.
Those calls must switch to [`identifySchemaWithHashAlpha`](https://fluidframework.com/docs/api/fluid-framework/identifyschemawithhashalpha-function), keeping the same options.
This includes calls with no options, which previously enabled hash telemetry.

```typescript
// Before
const identity = identifySchemaAlpha({ expectedHash });

// After
const identity = identifySchemaWithHashAlpha({ expectedHash });
```

`IdentifySchemaOptions` types reusable options objects for the version-only factory, while `IdentifySchemaWithHashOptions` does the same for the hash-enabled factory.
Both are marked as `@input`, so future releases can add optional properties without requiring changes to those options objects.

#### Compatibility investigation

A schema compatibility investigation can start by comparing the versions the application expects with those stored in the document.
On [`TreeViewAlpha`](https://fluidframework.com/docs/api/fluid-framework/treeviewalpha-interface), [`schemaVersion`](https://fluidframework.com/docs/api/fluid-framework/treeviewalpha-interface#schemaversion-property) exposes the configured versions and [`storedSchemaVersion`](https://fluidframework.com/docs/api/fluid-framework/treeviewalpha-interface#storedschemaversion-property) exposes the document's versions.
The stored versions are also available through [`ViewableTreeAlpha.storedSchemaVersion`](https://fluidframework.com/docs/api/fluid-framework/viewabletreealpha-interface#storedschemaversion-property).

For example, the application might expect notes version `4` while the document stores version `3`.
If both still use comments version `1`, the mismatch points to the notes schema as a useful starting point.
The versions help explain the difference, but compatibility checks determine whether the document can be viewed or upgraded.

Version identifiers can also identify documents created by an experimental schema library, even after the experiment ends.
Giving that library its own identifier distinguishes its documents from those that only use the rest of the application schema.

For snapshot-based compatibility testing, [`exportCompatibilitySchemaSnapshot`](https://fluidframework.com/docs/api/fluid-framework/exportcompatibilityschemasnapshot-function) captures the configured versions alongside the schema.
This lets compatibility checks between releases account for version changes as well as schema structure.
