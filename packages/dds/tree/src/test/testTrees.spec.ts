/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { isDeepStrictEqual } from "node:util";

import { StagedSchemaUpgradePolicy, type SchemaUpgrade } from "../simple-tree/index.js";
import { createTreeSchema } from "../simple-tree/index.js";
import {
	simpleStoredSchemaToStoredSchema,
	transformSimpleSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../simple-tree/toStoredSchema.js";

import {
	getStagedSchemaUpgrades,
	testDocuments,
	testSchema,
	testSimpleTrees,
	testTrees,
} from "./testTrees.js";
import { compareSets } from "../util/index.js";

describe("testTrees", () => {
	for (const [collectionName, testCases] of Object.entries({
		testSchema,
		testSimpleTrees,
		testTrees,
		testDocuments,
	})) {
		// Test case names are used in snapshot filenames, which must not collide on case-insensitive filesystems.
		it(`${collectionName} has case-insensitively unique names`, () => {
			const names = new Map<string, string>();
			for (const testCase of testCases) {
				const normalizedName = testCase.name.toLowerCase();
				const existingName = names.get(normalizedName);
				assert.equal(
					existingName,
					undefined,
					`Test names "${existingName}" and "${testCase.name}" collide when normalized`,
				);
				names.set(normalizedName, testCase.name);
			}
		});
	}

	it("includes the schema for every simple tree", () => {
		const schemas = new Set(testSchema.map((testCase) => testCase.schema));
		// Check for duplicate schemas in the testSchema array.
		assert.equal(schemas.size, testSchema.length);

		for (const tree of testSimpleTrees) {
			assert(schemas.has(tree.schema), `Missing testSchema entry for tree '${tree.name}'`);
		}
	});

	// Currently we expect every schema to have at least one test tree.
	// If we ever add schemas which can't have any valid trees
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

	// Production analysis, conversion-cache, and context behavior over this catalog are covered in
	// simple-tree/treeSchema.spec.ts, simple-tree/toStoredSchema.spec.ts, and simple-tree/createContext.spec.ts.
	describe("staging in test schema", () => {
		for (const testCase of testSchema) {
			it(testCase.name, () => {
				// Reference conversions must bypass policy-key normalization and the stored-schema cache.
				const treeSchema = createTreeSchema(testCase.schema);
				const upgrades = getStagedSchemaUpgrades(testCase.schema);
				const upgradesFromConversion = new Set<SchemaUpgrade>();
				transformSimpleSchema(treeSchema, {
					includeStaged(upgrade) {
						upgradesFromConversion.add(upgrade);
						return true;
					},
					includeStagedOptional(upgrade) {
						upgradesFromConversion.add(upgrade);
						return true;
					},
				});
				assert(compareSets({ a: upgrades, b: upgradesFromConversion }));
				assert.equal(upgrades.size > 0, testCase.hasStagedSchema === true);

				const restrictive = simpleStoredSchemaToStoredSchema(
					transformSimpleSchema(treeSchema, StagedSchemaUpgradePolicy.restrictive),
				);
				const permissive = simpleStoredSchemaToStoredSchema(
					transformSimpleSchema(treeSchema, StagedSchemaUpgradePolicy.permissive),
				);
				// Catalog staging must be observable; redundant staging need not change the stored schema in general.
				const convertedHasStagedSchema = !isDeepStrictEqual(restrictive, permissive);
				assert.equal(convertedHasStagedSchema, testCase.hasStagedSchema === true);
			});
		}
	});
});
