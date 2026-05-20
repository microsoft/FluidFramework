/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import path from "node:path";

import { snapshotSchemaCompatibility } from "../../index.js";
// import { snapshotSchemaCompatibility } from "@fluidframework/tree/beta";

// The TreeViewConfiguration the application uses, which contains the application's schema.
import { treeViewConfiguration } from "./schema.js";
// The next version of the application which will be released.
import { packageVersion } from "./version.js";

// Provide some way to run the check in "update" mode when updating snapshots is intended.
const regenerateSnapshots = process.argv.includes("--snapshot");

// Setup the actual test. In this case using Mocha syntax.
describe("schema", () => {
	it("schema compatibility", () => {
		// Select a path to save the snapshots in.
		// This will depend on how your application organizes its test data.
		const snapshotDirectory = path.join(
			import.meta.dirname,
			"../../../src/test/snapshotCompatibilityCheckerExample/schema-snapshots",
		);
		snapshotSchemaCompatibility({
			snapshotDirectory,
			fileSystem: { ...fs, ...path },
			version: packageVersion,
			minVersionForCollaboration: "2.0.0",
			schema: treeViewConfiguration,
			mode: regenerateSnapshots ? "update" : "assert",
		});
	});
});
