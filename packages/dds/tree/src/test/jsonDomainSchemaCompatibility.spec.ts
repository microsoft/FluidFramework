/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import fs from "node:fs";
import { strict as assert } from "node:assert";
import { JsonAsTree } from "../jsonDomainSchema.js";
import { pkgVersion } from "../packageVersion.js";
import {
	checkCompatibility,
	SnapshotCompatibilityChecker,
	TreeViewConfiguration,
} from "../simple-tree/index.js";
import { testSrcPath } from "./testSrcPath.cjs";

describe("JsonDomain schema compatibility", () => {
	// Store compatibility snapshots with source code. Unlike the snapshots that snapshotTools.ts manages, these snapshots should not be
	// be regenerated automatically, as they are used to verify compatibility over time.
	const checker = new SnapshotCompatibilityChecker(
		path.join(testSrcPath, "jsonDomainSchemaSnapshots"),
		{ ...fs, ...path },
	);

	it.skip("write current view schema snapshot", () => {
		checker.writeSchemaSnapshot(
			`jsonDomainViewSchema_${pkgVersion}`,
			new TreeViewConfiguration({ schema: JsonAsTree.Tree }),
		);
	});

	it("current view schema can read content written by historical persisted schemas", () => {
		const currentViewSchema = new TreeViewConfiguration({ schema: JsonAsTree.Tree });
		const previousViewSchemas = checker.readAllSchemaSnapshots();
		for (const [name, previousViewSchema] of previousViewSchemas) {
			const backwardsCompatibilityStatus = checkCompatibility(
				previousViewSchema,
				currentViewSchema,
			);
			assert(
				backwardsCompatibilityStatus.canView,
				`Current view schema is not compatible with persisted schema from snapshot ${name}`,
			);
		}
	});

	it("current persisted schema can read content written by historical view schemas", () => {
		const currentViewSchema = new TreeViewConfiguration({ schema: JsonAsTree.Tree });
		const previousViewSchemas = checker.readAllSchemaSnapshots();
		for (const [name, previousViewSchema] of previousViewSchemas) {
			const forwardsCompatibilityStatus = checkCompatibility(
				currentViewSchema,
				previousViewSchema,
			);
			assert(
				forwardsCompatibilityStatus.canView,
				`Current persisted schema is not compatible with view schema from snapshot ${name}`,
			);
		}
	});
});
