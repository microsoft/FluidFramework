/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { isDeepStrictEqual } from "node:util";

import {
	StagedSchemaUpgradePolicy,
	toStoredSchema,
	type SchemaUpgrade,
} from "../simple-tree/index.js";

import { getStagedSchemaUpgrades, testSchema, testSimpleTrees } from "./testTrees.js";
import { compareSets } from "../util/index.js";

describe("test tree catalogs", () => {
	it("includes the schema for every simple tree", () => {
		const schemas = new Set(testSchema.map((testCase) => testCase.schema));
		// Check for duplicate schemas in the testSchema array.
		assert.equal(schemas.size, testSchema.length);

		for (const tree of testSimpleTrees) {
			assert(schemas.has(tree.schema), `Missing testSchema entry for tree '${tree.name}'`);
		}
	});

	// Currently we expect every schema to have at least one test tree.
	// If we ever add schema which can't have any valid trees
	// (like a recursive required field, or required field with no allowed types), this test will need to be updated to exclude those cases.
	it("includes at least one simple tree for every schema", () => {
		const treeSchemas = new Set(testSimpleTrees.map((tree) => tree.schema));

		for (const testCase of testSchema) {
			assert(
				treeSchemas.has(testCase.schema),
				`Missing testSimpleTrees entry for schema '${testCase.name}'`,
			);
		}
	});

	describe("getStagedSchemaUpgrades on test schema", () => {
		for (const testCase of testSchema) {
			it(testCase.name, () => {
				// Validate getStagedSchemaUpgrades against toStoredSchema.
				const upgrades = getStagedSchemaUpgrades(testCase.schema);
				const upgradesFromToStoredSchema = new Set<SchemaUpgrade>();
				toStoredSchema(testCase.schema, {
					includeStaged(upgrade) {
						upgradesFromToStoredSchema.add(upgrade);
						return true;
					},
					includeStagedOptional(upgrade) {
						upgradesFromToStoredSchema.add(upgrade);
						return true;
					},
				});
				assert(compareSets({ a: upgrades, b: upgradesFromToStoredSchema }));

				// Sanity check: Convert the schema to stored schema using different staged schema policies and compare the results.
				const restrictive = toStoredSchema(
					testCase.schema,
					StagedSchemaUpgradePolicy.restrictive,
				);
				const permissive = toStoredSchema(
					testCase.schema,
					StagedSchemaUpgradePolicy.permissive,
				);
				const convertedHasStagedSchema = !isDeepStrictEqual(restrictive, permissive);
				assert.equal(upgrades.size > 0, convertedHasStagedSchema);
			});
		}
	});
});
