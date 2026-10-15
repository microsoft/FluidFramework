---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add optional checksums to help catch unintended schema changes

SharedTree adds an optional schema checksum to help catch unintended view schema changes, ideally during the testing stage.

The checksum is a hash saved in application code to guard against unintended schema changes.
To enable this check, provide the saved hash as `schemaHash` and the separately imported [`computeSchemaHash`](https://fluidframework.com/docs/api/tree#computeschemahash-function) function as `schemaHasher` in the optional [`schemaIdentity`](https://fluidframework.com/docs/api/tree/treeviewconfigurationalpha-class#schemaidentity-property) object.
Providing a `schemaHasher` enables telemetry with the schema hash during initialization and schema upgrades, even without an expected `schemaHash`.

#### Configure the expected hash

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
	schemaIdentity: { // Optional.
		schemaHash: expectedSchemaHash, // Optional: enables the hash check.
		schemaHasher: computeSchemaHash, // Required when schemaIdentity is provided.
	},
});
const view = tree.viewWith(config);
view.initialize({ text: "Hello" });
```

Keep the expected hash fixed until a schema change is intentional.
If a test reports a mismatch, review the schema change.
If the change is intentional, update the expected hash with the computed hash from the error message.
There is no need to call or log the hashing function yourself.
