/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	getTreeNodeSchemaPrivateData,
	StagedSchemaUpgradePolicy,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { getUnhydratedContext } from "../../simple-tree/createContext.js";
import { normalizeFieldSchema, SchemaFactoryAlpha } from "../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { createFieldSchema } from "../../simple-tree/fieldSchema.js";
import {
	simpleStoredSchemaToStoredSchema,
	toStoredSchema,
	transformSimpleSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/toStoredSchema.js";
// eslint-disable-next-line import-x/no-internal-modules
import { createTreeSchema, getRootSchemaDerivedData } from "../../simple-tree/treeSchema.js";
import { testSchema } from "../testTrees.js";
import { createSchemaGraph } from "./schemaTestUtils.js";

// getTreeNodeSchemaInitializedData is also exercised through TreeNodeValid in treeNodeValid.spec.ts.
// Stored-component failure/reuse behavior is covered independently in toStoredSchema.spec.ts.
describe("createContext", () => {
	describe("getUnhydratedContext", () => {
		it("shares recursive lookup data without sharing root-specific contexts", () => {
			const [a, b] = createSchemaGraph([[1], [0]]);
			assert(a !== undefined && b !== undefined);
			const aComponent = getRootSchemaDerivedData(a).treeSchema;
			const aContext = getUnhydratedContext(a);
			const bContext = getUnhydratedContext(b);
			assert.notStrictEqual(aContext, bContext);
			assert.strictEqual(aContext.schema, aComponent.definitions);
			assert.strictEqual(aContext.schema, bContext.schema);
			assert.notStrictEqual(aContext.flexContext.schema, bContext.flexContext.schema);
			assert.strictEqual(
				aContext.flexContext.schema.nodeSchema,
				bContext.flexContext.schema.nodeSchema,
			);
		});
		it("does not publish partial permissive conversions or contexts after an error", () => {
			const [a, b] = createSchemaGraph([[1], [0]]);
			assert(a !== undefined && b !== undefined);
			const data = getRootSchemaDerivedData(a);
			let throwOnConversion = true;
			Object.defineProperty(a, "persistedMetadata", {
				get() {
					if (throwOnConversion) {
						throw new Error("conversion failure");
					}
					return undefined;
				},
			});
			for (let i = 0; i < 2; i++) {
				assert.throws(() => getUnhydratedContext(a), /conversion failure/);
				assert.throws(() => getUnhydratedContext(b), /conversion failure/);
				assert.equal(data.unhydratedContext, undefined);
			}
			throwOnConversion = false;
			const context = getUnhydratedContext(a);
			assert.equal(context.flexContext.schema.nodeSchema.size, 2);
			assert.strictEqual(
				getUnhydratedContext(b).flexContext.schema.nodeSchema,
				context.flexContext.schema.nodeSchema,
			);
		});
		for (const initializeContextFirst of [false, true]) {
			it(`works ${initializeContextFirst ? "after" : "before"} context initialization`, () => {
				const sf = new SchemaFactoryAlpha("stagingContext");
				class Staged extends sf.objectRecursive("Staged", {
					child: sf.optionalRecursive([() => Staged]),
					staged: sf.stagedOptional(sf.number),
				}) {}
				class Unstaged extends sf.objectRecursive("Unstaged", {
					child: sf.optionalRecursive([() => Unstaged]),
				}) {}

				for (const [root, expected] of [
					[Staged, true],
					[Unstaged, false],
				] as const) {
					if (initializeContextFirst) {
						getTreeNodeSchemaPrivateData(root).idempotentInitialize();
					}
					const data = getRootSchemaDerivedData(root);
					if (!initializeContextFirst) {
						assert.equal(data.unhydratedContext, undefined);
					}
					assert.equal(getRootSchemaDerivedData(root).hasStagedSchema, expected);
					const context = getUnhydratedContext(root);
					assert.strictEqual(getRootSchemaDerivedData(root), data);
					assert.strictEqual(data.unhydratedContext, context);
					assert.strictEqual(getUnhydratedContext(root), context);
					assert.strictEqual(
						getTreeNodeSchemaPrivateData(root).idempotentInitialize().context,
						context,
					);
					assert.deepEqual(
						[...context.schema.values()],
						[...data.treeSchema.definitions.values()],
					);
					const permissive = toStoredSchema(root, StagedSchemaUpgradePolicy.permissive);
					assert.strictEqual(context.flexContext.schema, permissive);
					const restrictive = toStoredSchema(root, StagedSchemaUpgradePolicy.restrictive);
					assert.equal(restrictive === permissive, !expected);
				}
			});
		}
		describe("catalog contexts", () => {
			for (const testCase of testSchema) {
				it(testCase.name, () => {
					const original = normalizeFieldSchema(testCase.schema);
					const root = createFieldSchema(
						original.kind,
						original.allowedTypes,
						original.props ?? {},
					);
					const expected = simpleStoredSchemaToStoredSchema(
						transformSimpleSchema(
							createTreeSchema(root),
							StagedSchemaUpgradePolicy.permissive,
						),
					);
					const data = getRootSchemaDerivedData(root);
					assert.equal(data.unhydratedContext, undefined);
					const context = getUnhydratedContext(root);
					assert.strictEqual(data.unhydratedContext, context);
					assert.strictEqual(getUnhydratedContext(root), context);
					assert.strictEqual(context.schema, data.treeSchema.definitions);
					assert.deepEqual(context.flexContext.schema, expected);
					assert.strictEqual(
						context.flexContext.schema,
						toStoredSchema(root, StagedSchemaUpgradePolicy.permissive),
					);
				});
			}
		});
	});
});
