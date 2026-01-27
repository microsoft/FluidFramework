---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Promote checkSchemaCompatibilitySnapshots to beta

[`checkSchemaCompatibilitySnapshots`](https://fluidframework.com/docs/api/fluid-framework#checkschemacompatibilitysnapshots-function) has been promoted to `@beta`.
It is recommended that all SharedTree applications use this API to write schema compatibility tests.

Usage should look something like:

```typescript
import fs from "node:fs";
import path from "node:path";

import { checkSchemaCompatibilitySnapshots } from "@fluidframework/tree/beta";

// The TreeViewConfiguration the application uses, which contains the application's schema.
import { treeViewConfiguration } from "../schema.js";

// Provide some way to run the check in "update" mode when updating snapshots is intended.
const regenerateSnapshots = process.argv.includes("--snapshot");
// Setup the actual test. In this case using Mocha syntax.
describe("schema", () => {
	it("schema compatibility", () => {
		// Select a path to save the snapshots in.
		// This will depend on how your application organizes its test data.
		const snapshotDirectory = path.join(
			import.meta.dirname,
			"../../src/test/schema-snapshots",
		);
		checkSchemaCompatibilitySnapshots({
			snapshotDirectory,
			fileSystem: { ...fs, ...path },
			version: "2.0.0",
			schema: treeViewConfiguration,
			minVersionForCollaboration: "2.0.0",
			mode: regenerateSnapshots ? "update" : "test",
		});
	});
});
```
