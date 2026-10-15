---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add optional checksums to help catch unintended schema changes

SharedTree adds an optional schema checksum to help catch unintended view schema changes, ideally during the testing stage.
The checksum is a hash computed during development and saved in application source code.
During [initialization](https://fluidframework.com/docs/api/tree/treeview-interface#initialize-methodsignature) or [schema upgrade](https://fluidframework.com/docs/api/tree/treeview-interface#upgradeschema-methodsignature), SharedTree computes the hash of the provided schema and compares it with the saved hash.
If the hashes differ, SharedTree throws a `UsageError` before it changes the document.

#### Generate a hash during development

First, use [`computeSchemaHash`](https://fluidframework.com/docs/api/tree#computeschemahash-function) to compute a hash from the view schema with the appropriate [staged upgrade policy](https://fluidframework.com/docs/api/tree/stagedschemaupgradepolicy-interface).

```typescript
import {
	computeSchemaHash,
	SchemaFactoryAlpha,
	StagedSchemaUpgradePolicy,
} from "fluid-framework/alpha";

const sf = new SchemaFactoryAlpha("com.example");
const stagedNumber = sf.staged(sf.number);
class Note extends sf.object("Note", { text: sf.types([sf.string, stagedNumber]) }) {}
const stagedUpgradePolicy = StagedSchemaUpgradePolicy.enabledStagedUpgrades(
	stagedNumber.metadata.stagedSchemaUpgrade!,
);

console.log(computeSchemaHash(Note, stagedUpgradePolicy));
// c918013b30e1f898bc02a3c222531dff36fbf83dbc1507b1c7962c1101b25c7a
```

#### Save the hash in application source code

Save the printed hash as a constant with the schema:

```typescript
const expectedSchemaHash =
	"c918013b30e1f898bc02a3c222531dff36fbf83dbc1507b1c7962c1101b25c7a";
```

Keep this value fixed until a schema change is intended.
The logging code is only needed during development.

#### Pass the hash to the tree view configuration

Set [`schemaIdentity`](https://fluidframework.com/docs/api/tree/treeviewconfigurationalpha-class#schemaidentity-property) to the saved hash and the same [`computeSchemaHash`](https://fluidframework.com/docs/api/tree#computeschemahash-function) function:

```typescript
import {
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
