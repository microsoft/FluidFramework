/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { isDeepStrictEqual } from "node:util";

// eslint-disable-next-line import-x/no-internal-modules
import { getTreeNodeSchemaPrivateData } from "../simple-tree/core/index.js";
import {
	normalizeFieldSchema,
	StagedSchemaUpgradePolicy,
	toStoredSchema,
	type SchemaUpgrade,
} from "../simple-tree/index.js";
import { getUnhydratedContext, createTreeSchema } from "../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { createFieldSchema } from "../simple-tree/fieldSchema.js";
import {
	hasStagedSchema,
	simpleStoredSchemaToStoredSchema,
	transformSimpleSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../simple-tree/toStoredSchema.js";
// eslint-disable-next-line import-x/no-internal-modules
import { getSchemaDerivedData } from "../simple-tree/treeSchema.js";

import {
	getStagedSchemaUpgrades,
	testDocuments,
	testSchema,
	testSimpleTrees,
	testTrees,
} from "./testTrees.js";
import { compareSets } from "../util/index.js";

describe("test tree catalogs", () => {
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
				assert.equal(hasStagedSchema(testCase.schema), testCase.hasStagedSchema === true);
				for (const node of treeSchema.definitions.values()) {
					assert.equal(
						getTreeNodeSchemaPrivateData(node).component?.hasStagedSchema,
						getStagedSchemaUpgrades(node).size > 0,
						`Incorrect cached staging reachability for ${node.identifier}`,
					);
				}
			});

			for (const permissiveFirst of [false, true]) {
				it(`${testCase.name}: ${permissiveFirst ? "permissive" : "restrictive"} first`, () => {
					const original = normalizeFieldSchema(testCase.schema);
					// A fresh field wrapper avoids root-result cache hits, but deliberately retains reusable component analysis.
					const root = createFieldSchema(
						original.kind,
						original.allowedTypes,
						original.props ?? {},
					);
					const treeSchema = createTreeSchema(root);
					const expectedRestrictive = simpleStoredSchemaToStoredSchema(
						transformSimpleSchema(treeSchema, StagedSchemaUpgradePolicy.restrictive),
					);
					const expectedPermissive = simpleStoredSchemaToStoredSchema(
						transformSimpleSchema(treeSchema, StagedSchemaUpgradePolicy.permissive),
					);
					const restrictivePolicy = { ...StagedSchemaUpgradePolicy.restrictive };
					const permissivePolicy = { ...StagedSchemaUpgradePolicy.permissive };
					const policies = permissiveFirst
						? [permissivePolicy, restrictivePolicy]
						: [restrictivePolicy, permissivePolicy];
					for (const policy of policies) {
						toStoredSchema(root, policy);
					}
					const restrictive = toStoredSchema(root, restrictivePolicy);
					const permissive = toStoredSchema(root, permissivePolicy);
					assert.deepEqual(restrictive, expectedRestrictive);
					assert.deepEqual(permissive, expectedPermissive);
					assert.equal(hasStagedSchema(root), testCase.hasStagedSchema === true);
					assert.equal(restrictive === permissive, !testCase.hasStagedSchema);
					assert.strictEqual(toStoredSchema(root, restrictivePolicy), restrictive);
					const data = getSchemaDerivedData(root);
					const context = getUnhydratedContext(root);
					assert.strictEqual(data.unhydratedContext, context);
					assert.deepEqual(context.flexContext.schema, expectedPermissive);
					assert.strictEqual(
						context.flexContext.schema,
						toStoredSchema(root, StagedSchemaUpgradePolicy.permissive),
					);
					assert.deepEqual(
						[...context.schema.values()],
						[...data.treeSchema.definitions.values()],
					);
					if (!testCase.hasStagedSchema) {
						assert.strictEqual(
							toStoredSchema(root, {
								...restrictivePolicy,
								includeAlreadyEnabledUpgrades: true,
							}),
							permissive,
						);
						assert.strictEqual(
							toStoredSchema(root, StagedSchemaUpgradePolicy.permissive),
							permissive,
						);
					}
				});
			}
		}
	});
});
