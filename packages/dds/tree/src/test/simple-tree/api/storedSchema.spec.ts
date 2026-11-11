/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { FluidClientVersion } from "../../../codec/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import {
	comparePersistedSchema,
	extractPersistedSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../simple-tree/api/storedSchema.js";
import {
	SchemaFactory,
	TreeViewConfigurationAlpha,
	type SchemaUpgrade,
} from "../../../simple-tree/index.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
import { getStagedSchemaUpgrades, testDocuments } from "../../testTrees.js";

describe("simple-tree storedSchema", () => {
	it("retains a removed optional field when checking a historical persisted schema", () => {
		const factory = new SchemaFactory("taskRollback");

		class Before extends factory.object("Task", {
			title: factory.string,
			notes: factory.optional(factory.string),
		}) {}

		// Remove the `notes` field.
		// A client using this schema can still open documents that contain the `notes` field as an unknown optional field.
		// Documents created with this schema will need to be upgraded before they can be viewed by clients using the `Before` schema.
		class After extends factory.object("Task", {
			title: factory.string,
		}) {}

		const historical = extractPersistedSchema(Before, FluidClientVersion.v2_0, () =>
			assert.fail("This scenario does not contain staged schema"),
		);
		const current = extractPersistedSchema(After, FluidClientVersion.v2_0, () =>
			assert.fail("This scenario does not contain staged schema"),
		);
		const options = { jsonValidator: FormatValidatorBasic };

		// As with a live view, retaining the historical `notes` field makes the reduced view's proposed upgrade a no-op.
		const reducedView = comparePersistedSchema(historical, After, options);
		assert.equal(reducedView.canView, true);
		assert.equal(reducedView.canUpgrade, true);

		// Extraction still uses only the supplied view: a fresh document has no `notes` field, so the historical view must add it.
		const originalView = comparePersistedSchema(current, Before, options);
		assert.equal(originalView.canView, false);
		assert.equal(originalView.canUpgrade, true);
	});

	describe("test-schema", () => {
		useSnapshotDirectory("simple-tree-storedSchema");
		// TODO: Should also loop over schema formats once `extractPersistedSchema` takes the format version as an argument.
		for (const test of testDocuments) {
			it(`${test.name} - schema v1`, () => {
				const config = new TreeViewConfigurationAlpha({ schema: test.schema });
				const enabledUpgrades: SchemaUpgrade[] = [];
				const persisted = extractPersistedSchema(
					config.schema,
					FluidClientVersion.v2_0,
					(upgrade) => {
						enabledUpgrades.push(upgrade);
						return true;
					},
				);

				takeJsonSnapshot(persisted);

				const withoutStaged = extractPersistedSchema(
					config.schema,
					FluidClientVersion.v2_0,
					() => false,
				);
				if (getStagedSchemaUpgrades(test.schema).size > 0) {
					assert.notDeepEqual(withoutStaged, persisted);
					takeJsonSnapshot(withoutStaged, " - without staged");
				} else {
					assert.deepEqual(enabledUpgrades, []);
					assert.deepEqual(withoutStaged, persisted);
				}
			});

			// These tests assert that extractPersistedSchema gives the same result as the stored schema.
			// This is not always the case if there are staged schema. As the details of such cases are tested elsewhere, its fine to filter them out here.
			if (getStagedSchemaUpgrades(test.schema).size === 0) {
				// comparePersistedSchema is a trivial wrapper around functionality that is tested elsewhere,
				// but might as will give it a simple smoke test for the various test schema.
				it(`comparePersistedSchema to self ${test.name} - schema v1`, () => {
					const persistedA = extractPersistedSchema(test.schema, FluidClientVersion.v2_0, () =>
						assert.fail("Should not have staged schema"),
					);

					const status = comparePersistedSchema(persistedA, test.schema, {
						jsonValidator: FormatValidatorBasic,
					});
					assert.equal(status.canView, true);
					assert.equal(status.canUpgrade, true);
				});
			}
		}
	});
});
