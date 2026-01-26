---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Promote checkSchemaCompatibilitySnapshots to beta

[`checkSchemaCompatibilitySnapshots`](https://fluidframework.com/docs/api/fluid-framework#checkschemacompatibilitysnapshots-function) has been promoted to `@beta`.
It is recommended that all SharedTree applications use this API to write a schema compatibility test.

Usage should look something like:

```typescript
import fs from "node:fs";
import path from "node:path";

import { checkSchemaCompatibilitySnapshots } from "@fluidframework/tree/beta";

import { config } from "../schema.js";

const regenerateSnapshots = process.argv.includes("--snapshot");

describe("schema", () => {
	it("schema compatibility", () => {
		const snapshotDirectory = path.join(
			import.meta.dirname,
			"../../src/test/schema-snapshots",
		);
		checkSchemaCompatibilitySnapshots({
			snapshotDirectory,
			fileSystem: { ...fs, ...path },
			version: "2.0.0",
			schema: config,
			minVersionForCollaboration: "2.0.0",
			mode: regenerateSnapshots ? "update" : "test",
		});
	});
});
```
