/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import { FieldKinds } from "../../feature-libraries/index.js";
import {
	getTreeNodeSchemaPrivateData,
	StagedSchemaUpgradePolicy,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/core/index.js";
import { normalizeFieldSchema, SchemaFactoryAlpha } from "../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { createFieldSchema } from "../../simple-tree/fieldSchema.js";
import {
	toStoredSchema,

	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/toStoredSchema.js";
import {
	simpleStoredSchemaToStoredSchema,
	transformSimpleSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/schemaConversion.js";
// eslint-disable-next-line import-x/no-internal-modules
import {
	createTreeSchema,
	getRootSchemaDerivedData,
	SchemaComponent,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/treeSchema.js";
import { testSchema } from "../testTrees.js";
import { createSchemaGraph } from "./schemaTestUtils.js";

// getTreeNodeSchemaInitializedData is also exercised through TreeNodeValid in treeNodeValid.spec.ts.
// Stored-component failure/reuse behavior is covered independently in toStoredSchema.spec.ts.
describe("createContext", () => {
	describe("SchemaComponent", () => {
		it("constructs contexts only on request and reuses successful results", () => {
			const [root] = createSchemaGraph([[]]);
			assert(root !== undefined);
			let conversions = 0;
			Object.defineProperty(root, "persistedMetadata", {
				get() {
					conversions++;
					return undefined;
				},
			});
			const component = SchemaComponent.fromSchema(root);
			assert.strictEqual(SchemaComponent.fromSchema(root), component);
			const data = getRootSchemaDerivedData(root);
			assert.strictEqual(component, data.component);
			assert.equal(conversions, 0);
			const context = component.context;
			const afterConstruction = conversions;
			assert(afterConstruction > 0);
			assert.strictEqual(context.schema, data.treeSchema.definitions);
			assert.strictEqual(SchemaComponent.fromSchema(root).context, context);
			assert.equal(conversions, afterConstruction);
		});
		for (const target of [
			"same root",
			"another root",
			"cached root",
			"component getter",
			"cached component getter",
		] as const) {
			it(`rejects reentrant context requests for the ${target} and allows retry`, () => {
				const [root, other] = createSchemaGraph([[], []]);
				assert(root !== undefined && other !== undefined);
				const directComponent = SchemaComponent.fromSchema(
					target === "cached component getter" ? other : root,
				);
				if (target === "cached root" || target === "cached component getter") {
					assert(SchemaComponent.fromSchema(other).context);
				}
				let reenter = true;
				const requestContext = () =>
					target === "component getter" || target === "cached component getter"
						? directComponent.context
						: SchemaComponent.fromSchema(target === "same root" ? root : other).context;
				Object.defineProperty(root, "persistedMetadata", {
					get() {
						if (reenter) {
							requestContext();
						}
						return undefined;
					},
				});
				for (let i = 0; i < 2; i++) {
					assert.throws(
						() => SchemaComponent.fromSchema(root).context,
						validateAssertionError(/reentrant/),
					);
				}
				reenter = false;
				const context = SchemaComponent.fromSchema(root).context;
				assert.strictEqual(SchemaComponent.fromSchema(root).context, context);
				assert.notStrictEqual(SchemaComponent.fromSchema(other).context, context);
			});
		}
		for (const directContext of [false, true]) {
			it(`rejects reentrant ${directContext ? "context access" : "component lookup"} during lazy schema evaluation and resets the guard`, () => {
				const sf = new SchemaFactoryAlpha("reentrantAnalysis");
				class Other extends sf.object("Other", {}) {}
				const otherComponent = SchemaComponent.fromSchema(Other);
				const requestContext = () =>
					directContext ? otherComponent.context : SchemaComponent.fromSchema(Other).context;
				class Root extends sf.objectRecursive("Root", {
					child: sf.optionalRecursive([
						() => {
							requestContext();
							return Other;
						},
					]),
				}) {}
				assert.throws(
					() => SchemaComponent.fromSchema(Root),
					validateAssertionError(/reentrant/),
				);
				const context = SchemaComponent.fromSchema(Other).context;
				assert.strictEqual(otherComponent.context, context);
			});
		}
		it("shares contexts and lookup data across recursive component members", () => {
			const [a, b] = createSchemaGraph([[1], [0]]);
			assert(a !== undefined && b !== undefined);
			const aComponent = getRootSchemaDerivedData(a).treeSchema;
			const aContext = SchemaComponent.fromSchema(a).context;
			const bContext = SchemaComponent.fromSchema(b).context;
			assert.strictEqual(aContext, bContext);
			assert.strictEqual(aContext.schema, aComponent.definitions);
			assert.strictEqual(aContext.schema, bContext.schema);
			assert.strictEqual(aContext.flexContext, bContext.flexContext);
			assert.strictEqual(
				aContext.flexContext.schema.nodeSchema,
				bContext.flexContext.schema.nodeSchema,
			);
			for (const root of [[a], [a, b], normalizeFieldSchema(b)]) {
				assert.strictEqual(SchemaComponent.fromSchema(root).context, aContext);
			}
			assert.strictEqual(getRootSchemaDerivedData(a).component.context, aContext);
		});
		it("keeps root annotations separate from a shared component context", () => {
			const sf = new SchemaFactoryAlpha("rootContext");
			class Node extends sf.object("Node", {}) {}
			const optional = sf.optional(Node, { persistedMetadata: { label: "optional" } });
			const staged = sf.stagedOptional(Node);
			const context = SchemaComponent.fromSchema(Node).context;
			assert.strictEqual(SchemaComponent.fromSchema(optional).context, context);
			assert.strictEqual(SchemaComponent.fromSchema(staged).context, context);
			assert.equal(
				context.flexContext.schema.rootFieldSchema.kind,
				FieldKinds.forbidden.identifier,
			);
			assert.equal(context.flexContext.schema.rootFieldSchema.types.size, 0);
			assert.equal(getRootSchemaDerivedData(Node).component.hasStagedSchema, false);
			assert.equal(getRootSchemaDerivedData(staged).hasStagedSchema, true);
			const requiredStored = toStoredSchema(Node, StagedSchemaUpgradePolicy.permissive);
			const optionalStored = toStoredSchema(optional, StagedSchemaUpgradePolicy.permissive);
			assert.equal(requiredStored.rootFieldSchema.kind, FieldKinds.required.identifier);
			assert.equal(optionalStored.rootFieldSchema.kind, FieldKinds.optional.identifier);
			assert.deepEqual(optionalStored.rootFieldSchema.persistedMetadata, {
				label: "optional",
			});
			assert.strictEqual(context.flexContext.schema.nodeSchema, optionalStored.nodeSchema);
			assert.equal(
				toStoredSchema(staged, StagedSchemaUpgradePolicy.restrictive).rootFieldSchema.kind,
				FieldKinds.required.identifier,
			);
		});
		it("owns union and empty contexts on their synthetic components", () => {
			const [a, b] = createSchemaGraph([[], []]);
			assert(a !== undefined && b !== undefined);
			for (const root of [[], [a, b]]) {
				const data = getRootSchemaDerivedData(root);
				const context = SchemaComponent.fromSchema(root).context;
				assert.strictEqual(context, data.component.context);
				assert.strictEqual(context.schema, data.component.definitions);
				assert.strictEqual(
					context.flexContext.schema.nodeSchema,
					toStoredSchema(root, StagedSchemaUpgradePolicy.permissive).nodeSchema,
				);
				assert.equal(context.schema.size, root.length);
			}
		});
		it("lazily constructs contexts even after node initialization", () => {
			const [a, b] = createSchemaGraph([[1], [0]]);
			assert(a !== undefined && b !== undefined);
			let conversions = 0;
			for (const node of [a, b]) {
				Object.defineProperty(node, "persistedMetadata", {
					get() {
						conversions++;
						return undefined;
					},
				});
			}
			const aData = getTreeNodeSchemaPrivateData(a).idempotentInitialize();
			const bData = getTreeNodeSchemaPrivateData(b).idempotentInitialize();
			assert.strictEqual(aData.component, bData.component);
			assert.equal(conversions, 0);
			assert.strictEqual(aData.component.context, bData.component.context);
			assert.equal(conversions, 2);
		});
		for (const contextFirst of [false, true]) {
			it(`converts permissive definitions once (${contextFirst ? "context" : "stored schema"} first)`, () => {
				const [a, b] = createSchemaGraph([[1], [0]]);
				assert(a !== undefined && b !== undefined);
				let conversions = 0;
				for (const node of [a, b]) {
					Object.defineProperty(node, "persistedMetadata", {
						get() {
							conversions++;
							return undefined;
						},
					});
				}
				if (contextFirst) {
					assert(SchemaComponent.fromSchema(a).context);
				} else {
					toStoredSchema(a, StagedSchemaUpgradePolicy.permissive);
				}
				const context = SchemaComponent.fromSchema(b).context;
				const stored = toStoredSchema(b, StagedSchemaUpgradePolicy.permissive);
				assert.strictEqual(context.flexContext.schema.nodeSchema, stored.nodeSchema);
				assert.equal(conversions, 2);
			});
		}
		for (const cycle of [false, true]) {
			it(`creates a context for a deep ${cycle ? "cycle" : "chain"} without recursive conversion`, () => {
				const depth = 5000;
				const nodes = createSchemaGraph(
					Array.from({ length: depth }, (_, i) =>
						i + 1 < depth ? [i + 1] : cycle ? [0] : [],
					),
				);
				const root = nodes[0] ?? assert.fail();
				const context = SchemaComponent.fromSchema(root).context;
				assert.equal(context.schema.size, depth);
				assert.equal(context.flexContext.schema.nodeSchema.size, depth);
				assert.strictEqual(
					context.flexContext.schema.nodeSchema,
					toStoredSchema(root, StagedSchemaUpgradePolicy.permissive).nodeSchema,
				);
				if (cycle) {
					assert.strictEqual(
						SchemaComponent.fromSchema(nodes[depth - 1] ?? assert.fail()).context,
						context,
					);
				}
			});
		}
		it("does not publish partial permissive conversions or contexts after an error", () => {
			const [a, b] = createSchemaGraph([[1], [0]]);
			assert(a !== undefined && b !== undefined);
			getRootSchemaDerivedData(a);
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
				assert.throws(() => SchemaComponent.fromSchema(a).context, /conversion failure/);
				assert.throws(() => SchemaComponent.fromSchema(b).context, /conversion failure/);
			}
			throwOnConversion = false;
			const context = SchemaComponent.fromSchema(a).context;
			assert.equal(context.flexContext.schema.nodeSchema.size, 2);
			assert.strictEqual(
				SchemaComponent.fromSchema(b).context.flexContext.schema.nodeSchema,
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
					assert.equal(getRootSchemaDerivedData(root).hasStagedSchema, expected);
					const context = SchemaComponent.fromSchema(root).context;
					assert.strictEqual(getRootSchemaDerivedData(root), data);
					assert.strictEqual(SchemaComponent.fromSchema(root).context, context);
					assert.strictEqual(
						getTreeNodeSchemaPrivateData(root).idempotentInitialize().component.context,
						context,
					);
					assert.deepEqual(
						[...context.schema.values()],
						[...data.treeSchema.definitions.values()],
					);
					const permissive = toStoredSchema(root, StagedSchemaUpgradePolicy.permissive);
					assert.strictEqual(context.flexContext.schema.nodeSchema, permissive.nodeSchema);
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
					const context = SchemaComponent.fromSchema(root).context;
					assert.strictEqual(SchemaComponent.fromSchema(root).context, context);
					assert.strictEqual(context.schema, data.treeSchema.definitions);
					assert.deepEqual(context.flexContext.schema.nodeSchema, expected.nodeSchema);
					assert.strictEqual(
						context.flexContext.schema.nodeSchema,
						toStoredSchema(root, StagedSchemaUpgradePolicy.permissive).nodeSchema,
					);
				});
			}
		});
	});
});
