/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { FieldKinds } from "../../feature-libraries/index.js";
import { TreeAlpha } from "../../shared-tree/index.js";
import {
	getTreeNodeSchemaPrivateData,
	StagedSchemaUpgradePolicy,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/core/index.js";
import {
	getUnhydratedContext,
	normalizeFieldSchema,
	SchemaFactoryAlpha,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
} from "../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { createFieldSchema } from "../../simple-tree/fieldSchema.js";
import {
	simpleStoredSchemaToStoredSchema,
	transformSimpleSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/toStoredSchema.js";
// eslint-disable-next-line import-x/no-internal-modules
import {
	createTreeSchema,
	getRootSchemaDerivedData,
	SchemaComponent,
	toStoredSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/treeSchema.js";
import { testSchema } from "../testTrees.js";
import { brand } from "../../util/index.js";
import { createSchemaGraph } from "./schemaTestUtils.js";

// getTreeNodeSchemaInitializedData is also exercised through TreeNodeValid in treeNodeValid.spec.ts.
// Stored-schema conversion and caching are covered independently in toStoredSchema.spec.ts.
describe("createContext", () => {
	describe("getUnhydratedContext", () => {
		it("supports leaf schemas and implicit and explicit field roots", () => {
			const sf = new SchemaFactoryAlpha("contextAdapter");
			class A extends sf.object("A", {}) {}
			class B extends sf.object("B", {}) {}
			assert.strictEqual(
				getUnhydratedContext(sf.number),
				SchemaComponent.fromSchema(sf.number).context,
			);
			for (const root of [
				A,
				[],
				[A, B],
				sf.optional(A),
				sf.types([sf.staged(A), B]),
			] as const) {
				const context = getUnhydratedContext(root);
				assert.strictEqual(getUnhydratedContext(root), context);
				assert.strictEqual(getRootSchemaDerivedData(root).context, context);
			}
		});
	});
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
			assert.deepEqual(data.components, new Set([component]));
			assert.equal(conversions, 0);
			const context = component.context;
			const afterConstruction = conversions;
			assert(afterConstruction > 0);
			assert.strictEqual(context.schema, data.treeSchema.definitions);
			assert.strictEqual(SchemaComponent.fromSchema(root).context, context);
			assert.equal(conversions, afterConstruction);
		});
		for (const target of ["same root", "another root", "component getter"] as const) {
			it(`rejects reentrant context initialization for the ${target}`, () => {
				const [root, other] = createSchemaGraph([[], []]);
				assert(root !== undefined && other !== undefined);
				const directComponent = SchemaComponent.fromSchema(root);
				const requestContext = () =>
					target === "component getter"
						? directComponent.context
						: SchemaComponent.fromSchema(target === "same root" ? root : other).context;
				Object.defineProperty(root, "persistedMetadata", {
					get() {
						requestContext();
						return undefined;
					},
				});
				assert.throws(
					() => directComponent.context,
					validateUsageError(/Schema initialization must not be reentrant/),
				);
			});
		}
		for (const target of ["node", "configuration"] as const) {
			for (const lookup of ["component", "root", "root field"] as const) {
				it(`rejects ${target} initialization during lazy ${lookup} evaluation`, () => {
					const sf = new SchemaFactoryAlpha("reentrantAnalysis");
					class Other extends sf.object("Other", {}) {}
					const resolveOther = () => {
						if (target === "node") {
							new Other({});
						} else {
							new TreeViewConfiguration({ schema: Other });
						}
						return Other;
					};
					class Root extends sf.objectRecursive("Root", {
						child: sf.optionalRecursive([resolveOther]),
					}) {}
					assert.throws(
						() =>
							lookup === "component"
								? SchemaComponent.fromSchema(Root)
								: getRootSchemaDerivedData(
										lookup === "root" ? Root : sf.optionalRecursive([resolveOther]),
									),
						validateUsageError(/Schema initialization must not be reentrant/),
					);
					class Independent extends sf.object("Independent", {}) {}
					assert(new Independent({}) instanceof Independent);
				});
			}
		}
		for (const callback of ["lazy reference", "metadata getter"] as const) {
			it(`allows cached schema and context access from a ${callback}`, () => {
				const sf = new SchemaFactoryAlpha("reentrantAnalysis");
				class Other extends sf.object("Other", {}) {}
				new Other({});
				const component = SchemaComponent.fromSchema(Other);
				const data = getRootSchemaDerivedData(Other);
				const context = component.context;
				const unionRoot = [Other];
				const unionData = getRootSchemaDerivedData(unionRoot);
				const emptyRoot: [] = [];
				const emptyData = getRootSchemaDerivedData(emptyRoot);
				const emptyContext = emptyData.context;
				let calls = 0;
				const useCachedSchema = () => {
					calls++;
					assert.strictEqual(SchemaComponent.fromSchema(Other), component);
					assert.strictEqual(getRootSchemaDerivedData(Other), data);
					assert.strictEqual(getRootSchemaDerivedData(unionRoot), unionData);
					assert.strictEqual(data.context, context);
					assert.strictEqual(component.context, context);
					assert.strictEqual(getUnhydratedContext(Other), context);
					assert.strictEqual(getUnhydratedContext(unionRoot), context);
					assert.strictEqual(getRootSchemaDerivedData(emptyRoot).context, emptyContext);
					assert.strictEqual(
						toStoredSchema(Other, StagedSchemaUpgradePolicy.permissive).nodeSchema,
						context.flexContext.schema.nodeSchema,
					);
					assert(new Other({}) instanceof Other);
				};
				class Root extends sf.objectRecursive("Root", {
					child: sf.optionalRecursive([
						() => {
							if (callback === "lazy reference") {
								useCachedSchema();
							}
							return Other;
						},
					]),
				}) {}
				if (callback === "metadata getter") {
					Object.defineProperty(Root, "persistedMetadata", {
						get() {
							useCachedSchema();
							return undefined;
						},
					});
				}
				assert.equal(SchemaComponent.fromSchema(Root).context.schema.size, 2);
				assert.equal(calls, 1);
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
				assert.strictEqual(getRootSchemaDerivedData(root).context, aContext);
			}
			assert.strictEqual(getRootSchemaDerivedData(a).context, aContext);
		});
		it("keeps root annotations separate from a shared component context", () => {
			const sf = new SchemaFactoryAlpha("rootContext");
			class Node extends sf.object("Node", {}) {}
			const optional = sf.optional(Node, { persistedMetadata: { label: "optional" } });
			const staged = sf.stagedOptional(Node);
			const context = SchemaComponent.fromSchema(Node).context;
			assert.strictEqual(getRootSchemaDerivedData(optional).context, context);
			assert.strictEqual(getRootSchemaDerivedData(staged).context, context);
			assert.equal(
				context.flexContext.schema.rootFieldSchema.kind,
				FieldKinds.forbidden.identifier,
			);
			assert.equal(context.flexContext.schema.rootFieldSchema.types.size, 0);
			assert.equal(SchemaComponent.fromSchema(Node).hasStagedSchema, false);
			assert.equal(getRootSchemaDerivedData(staged).hasStagedSchema, true);
			const requiredStored = toStoredSchema(Node, StagedSchemaUpgradePolicy.permissive);
			const optionalStored = toStoredSchema(optional, StagedSchemaUpgradePolicy.permissive);
			assert.equal(requiredStored.rootFieldSchema.kind, FieldKinds.required.identifier);
			assert.equal(optionalStored.rootFieldSchema.kind, FieldKinds.optional.identifier);
			assert.deepEqual(optionalStored.rootFieldSchema.persistedMetadata, {
				label: "optional",
			});
			assert.strictEqual(context.flexContext.schema.nodeSchema, requiredStored.nodeSchema);
			assert.deepEqual(context.flexContext.schema.nodeSchema, optionalStored.nodeSchema);
			assert.equal(
				toStoredSchema(staged, StagedSchemaUpgradePolicy.restrictive).rootFieldSchema.kind,
				FieldKinds.required.identifier,
			);
		});
		it("owns union and empty contexts on root-derived data", () => {
			const [a, b] = createSchemaGraph([[], []]);
			assert(a !== undefined && b !== undefined);
			for (const root of [[], [a, b]]) {
				const data = getRootSchemaDerivedData(root);
				const context = data.context;
				assert.strictEqual(context, getRootSchemaDerivedData(root).context);
				assert.strictEqual(context.schema, data.definitions);
				assert.strictEqual(
					context.flexContext.schema.nodeSchema,
					toStoredSchema(root, StagedSchemaUpgradePolicy.permissive).nodeSchema,
				);
				assert.equal(context.schema.size, root.length);
				assert.notStrictEqual(context, getRootSchemaDerivedData([...root]).context);
				for (const component of data.components) {
					assert.notStrictEqual(context, component.context);
				}
			}
		});
		for (const contextFirst of [false, true]) {
			it(`shares root-owned node maps with stored conversion (${contextFirst ? "context" : "stored schema"} first)`, () => {
				const [a, b] = createSchemaGraph([[], []]);
				assert(a !== undefined && b !== undefined);
				for (const root of [[], [a, b]]) {
					const data = getRootSchemaDerivedData(root);
					if (contextFirst) {
						assert(data.context);
					}
					const stored = toStoredSchema(root, StagedSchemaUpgradePolicy.permissive);
					assert.strictEqual(data.context.flexContext.schema.nodeSchema, stored.nodeSchema);
				}
			});
		}
		it("allows cached component lookup before its definitions are materialized during conversion", () => {
			const [a, b] = createSchemaGraph([[], []]);
			assert(a !== undefined && b !== undefined);
			const data = getRootSchemaDerivedData([a, b]);
			let lookups = 0;
			Object.defineProperty(a, "persistedMetadata", {
				get() {
					const component = SchemaComponent.fromSchema(b);
					assert(data.components.has(component));
					assert.deepEqual([...component.definitions.values()], [b]);
					lookups++;
					return undefined;
				},
			});
			assert.equal(data.context.schema.size, 2);
			assert.equal(lookups, 1);
		});
		for (const target of ["root lookup", "root context"] as const) {
			it(`rejects reentrant ${target} initialization during root-owned context construction`, () => {
				const [a, b] = createSchemaGraph([[], []]);
				assert(a !== undefined && b !== undefined);
				const data = getRootSchemaDerivedData([a, b]);
				const other = getRootSchemaDerivedData([]);
				Object.defineProperty(a, "persistedMetadata", {
					get() {
						if (target === "root lookup") {
							getRootSchemaDerivedData([]);
						} else {
							assert(other.context);
						}
						return undefined;
					},
				});
				assert.throws(
					() => data.context,
					validateUsageError(/Schema initialization must not be reentrant/),
				);
			});
		}
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
			it(`reuses a singleton component's root conversion (${contextFirst ? "context" : "stored schema"} first)`, () => {
				const [root] = createSchemaGraph([[0]]);
				assert(root !== undefined);
				let conversions = 0;
				Object.defineProperty(root, "persistedMetadata", {
					get() {
						conversions++;
						return undefined;
					},
				});
				if (contextFirst) {
					assert(SchemaComponent.fromSchema(root).context);
				} else {
					toStoredSchema(root, StagedSchemaUpgradePolicy.permissive);
				}
				const context = SchemaComponent.fromSchema(root).context;
				const stored = toStoredSchema(root, StagedSchemaUpgradePolicy.permissive);
				assert.strictEqual(context.flexContext.schema.nodeSchema, stored.nodeSchema);
				assert.equal(conversions, 1);
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
				assert.deepEqual(
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
		it("propagates conversion errors during context construction", () => {
			const [a, b] = createSchemaGraph([[1], [0]]);
			assert(a !== undefined && b !== undefined);
			getRootSchemaDerivedData(a);
			Object.defineProperty(a, "persistedMetadata", {
				get() {
					throw new Error("conversion failure");
				},
			});
			assert.throws(() => SchemaComponent.fromSchema(a).context, /conversion failure/);
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
		describe("contexts of components included in other definitions", () => {
			function setup() {
				const sf = new SchemaFactoryAlpha("includedContexts");
				class Leaf extends sf.object("Leaf", { value: sf.number }) {}
				class Middle extends sf.object("Middle", { leaf: Leaf }) {}
				class Other extends sf.object("Other", {}) {}
				class Top extends sf.object("Top", { middle: Middle, other: Other }) {}
				// Building the definitions of Top includes those of Middle.
				assert.equal(new TreeViewConfigurationAlpha({ schema: Top }).definitions.size, 5);
				return { Leaf, Middle, Other, Top, number: sf.number };
			}

			it("look up exactly the schema reachable from the component, without definitions of their own", () => {
				const { Leaf, Middle, Other, Top, number } = setup();
				const descriptor =
					Object.getOwnPropertyDescriptor(SchemaComponent.prototype, "definitions") ??
					assert.fail("SchemaComponent has a definitions getter");
				const built: SchemaComponent[] = [];
				Object.defineProperty(SchemaComponent.prototype, "definitions", {
					...descriptor,
					get(this: SchemaComponent) {
						built.push(this);
						return descriptor.get?.call(this) as unknown;
					},
				});
				let context;
				try {
					context = getUnhydratedContext(Middle);
				} finally {
					Object.defineProperty(SchemaComponent.prototype, "definitions", descriptor);
				}
				assert.deepEqual(built, []);
				assert.equal(context.schema.size, 3);
				assert.strictEqual(context.schema.get(Middle.identifier), Middle);
				assert.strictEqual(context.schema.get(Leaf.identifier), Leaf);
				assert.equal(context.schema.get(Top.identifier), undefined);
				assert.equal(context.schema.has(Other.identifier), false);
				assert.equal(context.schema.has(Leaf.identifier), true);
				assert.deepEqual(
					new Map(context.schema),
					new Map<string, unknown>([
						[Middle.identifier, Middle],
						[Leaf.identifier, Leaf],
						[number.identifier, number],
					]),
				);
				const visited: string[] = [];
				// eslint-disable-next-line unicorn/no-array-for-each -- Tests the map's forEach.
				context.schema.forEach((schema, identifier, map) => {
					assert.strictEqual(schema.identifier, identifier);
					assert.strictEqual(map, context.schema);
					visited.push(identifier);
				});
				assert.deepEqual(visited.sort(), [...context.schema.keys()].sort());
				assert.deepEqual(
					[...context.schema.values()].map((schema) => schema.identifier).sort(),
					[Leaf.identifier, Middle.identifier, number.identifier].sort(),
				);
				assert.deepEqual(
					new Map(context.schema),
					new Map(SchemaComponent.fromSchema(Middle).definitions),
				);
			});

			it("share stored schema with their roots", () => {
				const { Leaf, Middle, Top } = setup();
				const context = getUnhydratedContext(Middle);
				const stored = toStoredSchema(Middle, StagedSchemaUpgradePolicy.permissive);
				assert.strictEqual(context.flexContext.schema.nodeSchema, stored.nodeSchema);
				assert.strictEqual(
					toStoredSchema(Middle, StagedSchemaUpgradePolicy.restrictive),
					stored,
				);
				assert.equal(stored.nodeSchema.size, 3);
				assert.equal(stored.nodeSchema.get(brand(Top.identifier)), undefined);
				assert.strictEqual(
					stored.nodeSchema.get(brand(Leaf.identifier)),
					toStoredSchema(Top, StagedSchemaUpgradePolicy.restrictive).nodeSchema.get(
						brand(Leaf.identifier),
					),
				);
			});

			it("reject types not reachable from the component as before", () => {
				const { Leaf, Middle, Other } = setup();
				const imported = TreeAlpha.importVerbose(Middle, {
					type: Middle.identifier,
					fields: { leaf: { type: Leaf.identifier, fields: { value: 1 } } },
				});
				assert.equal(imported.leaf.value, 1);
				assert.throws(
					() =>
						TreeAlpha.importVerbose(Middle, {
							type: Middle.identifier,
							fields: { leaf: { type: Other.identifier, fields: {} } },
						}),
					validateUsageError(
						`Failed to parse tree due to occurrence of type ${JSON.stringify(Other.identifier)} which is not defined in this context.`,
					),
				);
			});

			it("don't keep the definitions of released roots alive", async () => {
				const sf = new SchemaFactoryAlpha("releasedRoots");
				class Leaf extends sf.object("Leaf", { value: sf.number }) {}
				class Middle extends sf.object("Middle", { leaf: Leaf }) {}
				const gc =
					(globalThis as { gc?: () => void }).gc ?? assert.fail("Tests run with expose-gc");
				// Builds the definitions of a root which includes Middle and a built-in leaf schema,
				// optionally gets Middle's context while they are alive, and releases the root.
				function useRoot(withContext: boolean): {
					definitions: WeakRef<object>;
					context: ReturnType<typeof getUnhydratedContext> | undefined;
				} {
					class Top extends sf.object(`Top${withContext}`, {
						middle: Middle,
						count: sf.number,
					}) {}
					const config = new TreeViewConfigurationAlpha({ schema: Top });
					return {
						definitions: new WeakRef(config.definitions),
						context: withContext ? getUnhydratedContext(Middle) : undefined,
					};
				}
				const collected = async (ref: WeakRef<object>): Promise<boolean> => {
					// A WeakRef's target is kept alive until the job which created or dereferenced it ends.
					await new Promise((resolve) => setTimeout(resolve, 0));
					gc();
					return ref.deref() === undefined;
				};

				assert(await collected(useRoot(false).definitions));
				const { definitions, context } = useRoot(true);
				assert(await collected(definitions));

				// Lookups which used the released definitions still find exactly the schema reachable from Middle.
				assert(context !== undefined);
				assert.equal(context.schema.size, 3);
				assert.strictEqual(context.schema.get(Leaf.identifier), Leaf);
				assert.deepEqual(
					new Map(context.schema),
					new Map(SchemaComponent.fromSchema(Middle).definitions),
				);
				const imported = TreeAlpha.importVerbose(Middle, {
					type: Middle.identifier,
					fields: { leaf: { type: Leaf.identifier, fields: { value: 1 } } },
				});
				assert.equal(imported.leaf.value, 1);
			});
		});
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
					const context = data.context;
					assert.strictEqual(getRootSchemaDerivedData(root).context, context);
					assert.deepEqual(new Map(context.schema), new Map(data.treeSchema.definitions));
					assert.deepEqual(context.flexContext.schema.nodeSchema, expected.nodeSchema);
					assert.deepEqual(
						context.flexContext.schema.nodeSchema,
						toStoredSchema(root, StagedSchemaUpgradePolicy.permissive).nodeSchema,
					);
				});
			}
		});
	});
});
