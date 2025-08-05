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
import { testDocuments } from "../../testTrees.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
import { typeboxValidator } from "../../../external-utilities/index.js";
import { FluidClientVersion } from "../../../codec/index.js";
import { TreeViewConfigurationAlpha, type SchemaUpgrade } from "../../../simple-tree/index.js";

describe("simple-tree storedSchema", () => {
	describe("test-schema", () => {
		useSnapshotDirectory("simple-tree-storedSchema");
		// TODO: Should also loop over schema formats once `extractPersistedSchema` takes the format version as an argument.
		for (const test of testDocuments) {
			it(`${test.name} - schema v1`, () => {
				const config = new TreeViewConfigurationAlpha({ schema: test.schema });
				const upgrades: SchemaUpgrade[] = [];
				const persisted = extractPersistedSchema(
					config.schema,
					FluidClientVersion.v2_0,
					(upgrade) => {
						upgrades.push(upgrade);
						return true;
					},
				);

				takeJsonSnapshot(persisted);

				const withoutStaged = extractPersistedSchema(
					config.schema,
					FluidClientVersion.v2_0,
					() => false,
				);
				if (test.hasStagedSchema) {
					assert.notDeepEqual(withoutStaged, persisted);
					takeJsonSnapshot(withoutStaged, " - without staged");
				} else {
					assert.deepEqual(upgrades, []);
					assert.deepEqual(withoutStaged, persisted);
				}
			});

			// These tests assert that extractPersistedSchema gives the same result as the stored schema.
			// This is not always the case if there are staged schema. As the details of such cases are tested elsewhere, its fine to filter them out here.
			if (!test.hasStagedSchema) {
				// comparePersistedSchema is a trivial wrapper around functionality that is tested elsewhere,
				// but might as will give it a simple smoke test for the various test schema.
				it(`comparePersistedSchema to self ${test.name} - schema v1`, () => {
					const persistedA = extractPersistedSchema(test.schema, FluidClientVersion.v2_0, () =>
						assert.fail("Should not have staged schema"),
					);

					const status = comparePersistedSchema(persistedA, test.schema, {
						jsonValidator: typeboxValidator,
					});
					assert.deepEqual(status, {
						isEquivalent: true,
						canView: true,
						canUpgrade: true,
					});
				});
			}
		}
	});
});
