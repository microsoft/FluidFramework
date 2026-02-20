/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import path from "node:path";

import { snapshotSchemaCompatibility } from "@fluidframework/tree/alpha";

import { config } from "../schema.js";

// This file demonstrates how applications can write tests which ensure they maintain compatibility with the schema from previously released versions.

const regenerateSnapshots = process.argv.includes("--snapshot");

describe("schema", () => {
	it("schema compatibility", () => {
		const snapshotDirectory = path.join(
			import.meta.dirname,
			"../../src/test/schema-snapshots",
		);
		// This app does not actually support a stable document format, so the versions used here are arbitrary.
		// Despite this, testing the schema for compatibility issues is a useful example of how apps should do this,
		// and testing the snapshotSchemaCompatibility API.
		// This app has a dummy legacy version 1.0.0 schema so it can include a compatibility test for upgrading an old schema.
		snapshotSchemaCompatibility({
			snapshotDirectory,
			fileSystem: { ...fs, ...path },
			version: "2.0.0",
			schema: config,
			minVersionForCollaboration: "2.0.0",
			mode: regenerateSnapshots ? "update" : "assert",
		});
	});
});
