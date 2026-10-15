---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add optional checksums to help catch unintended schema changes

SharedTree adds an optional schema checksum to help catch unintended view schema changes.
The checksum is a hash computed during development and saved in application source code.
During initialization or schema upgrade, SharedTree computes the hash of the provided schema and compares it with the saved hash.
If the hashes differ, SharedTree throws a `UsageError` before it changes the document.

The optional `schemaIdentity` property in `TreeViewConfigurationAlpha` enables this check.

#### Generate a hash during development

First, use `computeViewSchemaHash` to compute a hash from the view schema with the appropriate staged upgrade policy.
Pass the same encoding options used to configure the tree.

```typescript
import {
	computeViewSchemaHash,
	FluidClientVersion,
	SchemaFactoryAlpha,
	StagedSchemaUpgradePolicy,
} from "fluid-framework/alpha";

const sf = new SchemaFactoryAlpha("com.example");
const stagedNumber = sf.staged(sf.number);
class Note extends sf.object("Note", { text: sf.types([sf.string, stagedNumber]) }) {}
const stagedUpgradePolicy = StagedSchemaUpgradePolicy.enabledStagedUpgrades(
	stagedNumber.metadata.stagedSchemaUpgrade!,
);

const encodingOptions = { minVersionForCollab: FluidClientVersion.v2_0 };
console.log(computeViewSchemaHash(Note, stagedUpgradePolicy, encodingOptions));
// a4a68c3fdf9fcc59d6256840e4e00e978743c1dfae52fbed620c1c4634a67839
```

#### Save the hash in application source code

Save the printed hash as a constant with the schema:

```typescript
const expectedSchemaHash =
	"a4a68c3fdf9fcc59d6256840e4e00e978743c1dfae52fbed620c1c4634a67839";
```

Keep this value fixed until a schema change is intended.
The logging code is only needed during development.

#### Pass the hash to the tree view configuration

Set `schemaIdentity` to the saved hash and the `computeSchemaHash` function:

```typescript
import {
	computeSchemaHash,
	TreeViewConfigurationAlpha,
} from "fluid-framework/alpha";

const config = new TreeViewConfigurationAlpha({
	schema: Note,
	stagedUpgradePolicy,
	schemaIdentity: {
		schemaHash: expectedSchemaHash,
		schemaHasher: computeSchemaHash,
	},
});
const view = tree.viewWith(config);
view.initialize({ text: "Hello" });
```
