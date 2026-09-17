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
	TreeViewConfigurationAlpha,
	SchemaFactoryAlpha,
	checkCompatibility,
	type SchemaUpgrade,
} from "../../../simple-tree/index.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../../snapshots/index.js";
import { getStagedSchemaUpgrades, testDocuments } from "../../testTrees.js";

describe("simple-tree storedSchema", () => {
	it("reports metadata through both helpers without inspecting non-persisted metadata", () => {
		const factory = new SchemaFactoryAlpha("diagnostics");
		const metadata = {
			get custom(): never {
				throw new Error("custom metadata must not be traversed");
			},
			get description(): never {
				throw new Error("descriptions must not be traversed");
			},
		};
		const original = factory.objectAlpha(
			"Metadata",
			{
				value: factory.optional(factory.number, {
					persistedMetadata: { label: "before" },
					metadata,
				}),
			},
			{ metadata },
		);
		const view = factory.objectAlpha(
			"Metadata",
			{
				value: factory.optional(factory.number, {
					persistedMetadata: { label: "after", absentBefore: null },
					metadata,
				}),
			},
			{ metadata },
		);
		const persisted = extractPersistedSchema(original, FluidClientVersion.v2_0, () => false);
		for (const status of [
			checkCompatibility(
				new TreeViewConfigurationAlpha({ schema: original }),
				new TreeViewConfigurationAlpha({ schema: view }),
			),
			comparePersistedSchema(persisted, view, { jsonValidator: FormatValidatorBasic }),
		]) {
			assert.equal(status.canView, true);
			assert.equal(status.canUpgrade, true);
			assert.equal(status.isEquivalent, true);
			assert(
				status.allDiscrepancies.some(
					({ mismatch, location }) =>
						mismatch === "persistedMetadata" &&
						location !== "root" &&
						location.fieldKey === "value",
				),
			);
			assert.equal("canInitialize" in status, false);
			const serialized: unknown = JSON.parse(JSON.stringify(status));
			assert.deepEqual(serialized, {
				canView: true,
				canUpgrade: true,
				isEquivalent: true,
				allDiscrepancies: status.allDiscrepancies,
				enabledUpgrades: {},
			});
		}
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
					const { allDiscrepancies, ...legacyStatus } = status;

					// Verify that JSON serialization and parsing preserve the diagnostic payload without data loss.
					assert.deepEqual(JSON.parse(JSON.stringify(allDiscrepancies)), allDiscrepancies);

					assert.deepEqual(legacyStatus, {
						isEquivalent: true,
						canView: true,
						canUpgrade: true,
						discrepancies: undefined,
						enabledUpgrades: new Map(),
					});
				});
			}
		}
	});
});
