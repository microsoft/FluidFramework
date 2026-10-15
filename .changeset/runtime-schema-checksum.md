---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add optional checksums to help catch unintended schema changes

SharedTree adds an optional schema checksum to help catch unintended view schema changes, ideally during the testing stage.
The checksum is an expected hash saved in application source code.
When constructing the [view](https://fluidframework.com/docs/api/tree/viewabletree-interface#viewwith-methodsignature), SharedTree computes the hash of the provided schema and configured staged upgrade policy and compares it with the saved hash.
If the hashes differ, view construction throws a `UsageError` containing the expected and computed hashes.

#### Configure the expected hash

Set [`schemaIdentity`](https://fluidframework.com/docs/api/tree/treeviewconfigurationalpha-class#schemaidentity-property) to an expected hash and the separately imported [`computeSchemaHash`](https://fluidframework.com/docs/api/tree#computeschemahash-function) function.
To set the initial hash, use a non-empty placeholder and run a test that constructs the view.
Replace the placeholder with the computed hash from the error message.

```typescript
import {
	computeSchemaHash,
	SchemaFactoryAlpha,
	StagedSchemaUpgradePolicy,
	TreeViewConfigurationAlpha,
} from "fluid-framework/alpha";

const sf = new SchemaFactoryAlpha("com.example");
const stagedNumber = sf.staged(sf.number);
class Note extends sf.object("Note", { text: sf.types([sf.string, stagedNumber]) }) {}
const stagedUpgradePolicy = StagedSchemaUpgradePolicy.enabledStagedUpgrades(
	stagedNumber.metadata.stagedSchemaUpgrade!,
);

const expectedSchemaHash = "replace-with-computed-hash-from-error";

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

Keep the expected hash fixed until a schema change is intentional.
If a test reports a mismatch, review the schema change.
If the change is intentional, update the expected hash with the computed hash from the error message.
There is no need to call or log the hashing function yourself.
