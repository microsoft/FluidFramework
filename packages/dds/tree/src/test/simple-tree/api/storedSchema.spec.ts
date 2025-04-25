/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	comparePersistedSchema,
	extractPersistedSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/storedSchema.js";
import { testSimpleTrees } from "../../testTrees.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
import { typeboxValidator } from "../../../external-utilities/index.js";

describe("simple-tree storedSchema", () => {
	describe("test-schema", () => {
		useSnapshotDirectory("simple-tree-storedSchema");
		for (const schemaFormatVersion of [1, 2]) {
			for (const test of testSimpleTrees) {
				it(`${test.name} FormatV${schemaFormatVersion}`, () => {
					const persisted = extractPersistedSchema(test.schema, schemaFormatVersion);
					takeJsonSnapshot(persisted);
				});

				// comparePersistedSchema is a trivial wrapper around functionality that is tested elsewhere,
				// but might as will give it a simple smoke test for the various test schema.
				it(`comparePersistedSchema to self ${test.name} FormatV${schemaFormatVersion}`, () => {
					const persistedA = extractPersistedSchema(test.schema, schemaFormatVersion);
					const status = comparePersistedSchema(
						persistedA,
						test.schema,
						{
							jsonValidator: typeboxValidator,
						},
						false,
						schemaFormatVersion,
					);
					assert.deepEqual(status, {
						isEquivalent: true,
						canView: true,
						canUpgrade: true,
						canInitialize: false,
					});
				});
			}
		}
	});
});
