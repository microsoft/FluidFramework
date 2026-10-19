/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import path from "node:path";

import { TreeViewConfiguration } from "@fluidframework/tree";
import { snapshotSchemaCompatibility } from "@fluidframework/tree/alpha";

import { FormattedTextDefault } from "../formatted/index.js";

/**
 * Pass `--snapshot` to mocha to update the snapshots.
 */
const regenerateSnapshots = process.argv.includes("--snapshot");

describe("FormattedTextDefault", () => {
	it("schema compatibility", () => {
		snapshotSchemaCompatibility({
			snapshotDirectory: path.join(
				import.meta.dirname,
				"../../src/test/schema-snapshots/formattedTextDefault",
			),
			fileSystem: { ...fs, ...path },
			// This schema was introduced in `@fluidframework/tree` 2.114.0.
			// When changing it, set this to the version of the package which will release the change, then regenerate the snapshots.
			version: "2.114.0",
			schema: new TreeViewConfiguration({ schema: FormattedTextDefault.Tree }),
			minVersionForCollaboration: "2.114.0",
			mode: regenerateSnapshots ? "update" : "assert",
			rejectSchemaChangesWithNoVersionChange: true,
		});
	});
});
