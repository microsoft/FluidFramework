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
		for (const test of testSimpleTrees) {
			it(test.name, () => {
				const persisted = extractPersistedSchema(test.schema);
				takeJsonSnapshot(persisted);
			});

			// comparePersistedSchema is a trivial wrapper around functionality that is tested elsewhere,
			// but might as will give it a simple smoke test for the various test schema.
			it(`comparePersistedSchema to self ${test.name}`, () => {
				const persistedA = extractPersistedSchema(test.schema);
				const persistedB = extractPersistedSchema(test.schema);
				const status = comparePersistedSchema(
					persistedA,
					persistedB,
					{
						jsonValidator: typeboxValidator,
					},
					false,
				);
				assert.deepEqual(status, {
					isEquivalent: true,
					canView: true,
					canUpgrade: true,
					canInitialize: false,
				});
			});
		}
	});
});
