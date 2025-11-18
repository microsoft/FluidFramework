/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import fs from "node:fs";
import { JsonAsTree } from "../jsonDomainSchema.js";
import { pkgVersion } from "../packageVersion.js";
import {
	checkCompatibility,
	exportCompatibilitySchemaSnapshot,
	importCompatibilitySchemaSnapshot,
	TreeViewConfiguration,
} from "../simple-tree/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";

// Store compatibility snapshots with source code. Unlike the snapshots that snapshotTools.ts manages, these snapshots should not be
// be regenerated automatically, as they are used to verify compatibility over time.
const snapshotDirectory = path.join(__dirname, "./snapshots");

function writeSchemaSnapshot(filename: string, viewSchema: TreeViewConfiguration): void {
	const snapshot = exportCompatibilitySchemaSnapshot(viewSchema);
	const fullPath = path.join(snapshotDirectory, filename);
	fs.mkdirSync(snapshotDirectory);
	fs.writeFileSync(fullPath, JSON.stringify(snapshot), "utf8");
}

function readSchemaSnapshot(filename: string): TreeViewConfiguration {
	const fullPath = path.join(snapshotDirectory, filename);
	const snapshot = JSON.parse(fs.readFileSync(fullPath, "utf8")) as JsonCompatibleReadOnly;
	return importCompatibilitySchemaSnapshot(snapshot);
}

function readAllSchemaSnapshots(): TreeViewConfiguration[] {
	const files = fs.readdirSync(snapshotDirectory);
	const snapshots: TreeViewConfiguration[] = [];
	for (const file of files) {
		if (file.endsWith(".json")) {
			snapshots.push(readSchemaSnapshot(file));
		}
	}
	return snapshots;
}

describe("JsonDomain schema compatibility", () => {
	it.only("write current view schema snapshot", () => {
		writeSchemaSnapshot(
			`jsonDomainViewSchema_${pkgVersion}.json`,
			new TreeViewConfiguration({ schema: JsonAsTree.Tree }),
		);
	});

	it("current view schema can read content written by historical persisted schemas", () => {
		const currentViewSchema = new TreeViewConfiguration({ schema: JsonAsTree.Tree });
		const previousViewSchemas = readAllSchemaSnapshots();
		for (const previousViewSchema of previousViewSchemas) {
			checkCompatibility(previousViewSchema, currentViewSchema);
		}
	});

	it("current persisted schema can read content written by historical view schemas", () => {
		const currentPersistedSchema = new TreeViewConfiguration({ schema: JsonAsTree.Tree });
		const previousViewSchemas = readAllSchemaSnapshots();
		for (const previousViewSchema of previousViewSchemas) {
			checkCompatibility(currentPersistedSchema, previousViewSchema);
		}
	});
});
