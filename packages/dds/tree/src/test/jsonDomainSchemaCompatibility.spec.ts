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
	exportCompatibilitySchemaSnapshot,
	importCompatibilitySchemaSnapshot,
	TreeViewConfiguration,
} from "../simple-tree/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";
import { testSrcPath } from "./testSrcPath.cjs";

class SnapshotIO {
	public constructor(private readonly snapshotDirectory: string) {}

	public writeSchemaSnapshot(snapshotName: string, viewSchema: TreeViewConfiguration): void {
		const snapshot = exportCompatibilitySchemaSnapshot(viewSchema);
		const fullPath = path.join(this.snapshotDirectory, `${snapshotName}.json`);
		fs.mkdirSync(this.snapshotDirectory, { recursive: true });
		fs.writeFileSync(fullPath, JSON.stringify(snapshot), "utf8");
	}

	public readSchemaSnapshot(snapshotName: string): TreeViewConfiguration {
		const fullPath = path.join(this.snapshotDirectory, `${snapshotName}.json`);
		const snapshot = JSON.parse(fs.readFileSync(fullPath, "utf8")) as JsonCompatibleReadOnly;
		return importCompatibilitySchemaSnapshot(snapshot);
	}

	public readAllSchemaSnapshots(): Map<string, TreeViewConfiguration> {
		const files = fs.readdirSync(this.snapshotDirectory);
		const snapshots: Map<string, TreeViewConfiguration> = new Map();
		for (const file of files) {
			if (file.endsWith(".json")) {
				const snapshotName = path.basename(file, ".json");
				snapshots.set(snapshotName, this.readSchemaSnapshot(snapshotName));
			}
		}
		return snapshots;
	}
}

describe("JsonDomain schema compatibility", () => {
	// Store compatibility snapshots with source code. Unlike the snapshots that snapshotTools.ts manages, these snapshots should not be
	// be regenerated automatically, as they are used to verify compatibility over time.
	const snapshotIO = new SnapshotIO(path.join(testSrcPath, "jsonDomainSchemaSnapshots"));

	it.skip("write current view schema snapshot", () => {
		snapshotIO.writeSchemaSnapshot(
			`jsonDomainViewSchema_${pkgVersion}`,
			new TreeViewConfiguration({ schema: JsonAsTree.Tree }),
		);
	});

	it("current view schema can read content written by historical persisted schemas", () => {
		const currentViewSchema = new TreeViewConfiguration({ schema: JsonAsTree.Tree });
		const previousViewSchemas = snapshotIO.readAllSchemaSnapshots();
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
		const previousViewSchemas = snapshotIO.readAllSchemaSnapshots();
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
