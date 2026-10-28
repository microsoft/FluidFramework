/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import {
	getTreeNodeSchemaPrivateData,
	type AllowedTypesFullEvaluated,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/core/index.js";
import {
	isObjectNodeSchema,
	normalizeFieldSchema,
	SchemaFactoryAlpha,
} from "../../simple-tree/index.js";
import {
	analyzeSchema,
	getCachedRootSchemaDerivedData,
	createTreeSchema,
	getRootSchemaDerivedData,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/treeSchema.js";
import { getStagedSchemaUpgrades, testSchema } from "../testTrees.js";
import { createSchemaGraph } from "./schemaTestUtils.js";

// Configuration-specific validation is covered in api/configuration.spec.ts.
// Stored conversion and context integration are covered in toStoredSchema.spec.ts and createContext.spec.ts.
describe("treeSchema", () => {
	describe("createTreeSchema", () => {
		it("builds independent graphs without populating component analysis", () => {
			const [a, b] = createSchemaGraph([[1], [0]]);
			assert(a !== undefined && b !== undefined);
			const first = createTreeSchema(a);
			const second = createTreeSchema(a);
			assert.notStrictEqual(first.definitions, second.definitions);
			assert.deepEqual(new Set(first.definitions.values()), new Set([a, b]));
			assert.equal(getCachedRootSchemaDerivedData(a)?.component, undefined);
			assert.equal(getCachedRootSchemaDerivedData(b)?.component, undefined);
		});
	});
	describe("analyzeSchema", () => {
		it("reports full allowed-type lists even after component analysis is cached", () => {
			const sf = new SchemaFactoryAlpha("repeatedReferences");
			const value = sf.types([sf.number, sf.staged(sf.number)]);
			class Root extends sf.objectAlpha("Root", { value, other: sf.number }) {}
			const root = normalizeFieldSchema(Root);
			const fields = getTreeNodeSchemaPrivateData(Root).childAllowedTypes.map((field) =>
				field.evaluate(),
			);
			for (let i = 0; i < 2; i++) {
				const reported: AllowedTypesFullEvaluated[] = [];
				assert.strictEqual(
					analyzeSchema(root, (types) => reported.push(types)),
					root,
				);
				assert.deepEqual(reported, [...fields, root.allowedTypesFull.evaluate()]);
				assert.equal(reported[0]?.types.length, 2);
				assert.notEqual(reported[0]?.types[1]?.metadata.stagedSchemaUpgrade, undefined);
			}
			assert.equal(getRootSchemaDerivedData(Root).hasStagedSchema, true);
		});
	});
	describe("getRootSchemaDerivedData", () => {
		it("inlines a single referenced component, including unions of its members", () => {
			const [a, b] = createSchemaGraph([[1], [0]]);
			assert(a !== undefined && b !== undefined);
			const aData = getRootSchemaDerivedData(a);
			for (const root of [b, [a], [a, b], normalizeFieldSchema(a)]) {
				const data = getRootSchemaDerivedData(root);
				assert.strictEqual(data.component, aData.component);
				assert.strictEqual(data.treeSchema.definitions, aData.component.definitions);
			}
		});
		it("uses an empty synthetic component for empty roots", () => {
			const root: [] = [];
			const data = getRootSchemaDerivedData(root);
			assert.equal(data.component.members.length, 0);
			assert.equal(data.component.dependencies.size, 0);
			assert.equal(data.component.definitions.size, 0);
			assert.strictEqual(data.treeSchema.definitions, data.component.definitions);
			assert.strictEqual(getRootSchemaDerivedData(root), data);
		});
		it("uses one synthetic component for a union of different components", () => {
			const [a, b, child] = createSchemaGraph([[2], [2], []]);
			assert(a !== undefined && b !== undefined && child !== undefined);
			const root = [a, b];
			const data = getRootSchemaDerivedData(root);
			assert.equal(data.component.members.length, 0);
			assert.deepEqual(
				data.component.dependencies,
				new Set([
					getRootSchemaDerivedData(a).component,
					getRootSchemaDerivedData(b).component,
				]),
			);
			assert.deepEqual(new Set(data.component.definitions.values()), new Set([a, b, child]));
			assert.strictEqual(data.treeSchema.definitions, data.component.definitions);
			assert.strictEqual(getRootSchemaDerivedData(root).component, data.component);
		});
		it("lazily caches component definitions without materializing descendant maps", () => {
			const [root, child] = createSchemaGraph([[1], []]);
			assert(root !== undefined && child !== undefined);
			analyzeSchema(root);
			const component = getCachedRootSchemaDerivedData(root)?.component ?? assert.fail();
			const dependency = getCachedRootSchemaDerivedData(child)?.component ?? assert.fail();
			const reads = new Map([
				[component, 0],
				[dependency, 0],
			]);
			for (const current of reads.keys()) {
				const members = current.members;
				Object.defineProperty(current, "members", {
					get() {
						reads.set(current, (reads.get(current) ?? 0) + 1);
						return members;
					},
				});
			}

			const definitions = component.definitions;
			assert.deepEqual([...reads.values()], [1, 1]);
			assert.deepEqual(new Set(definitions.values()), new Set([root, child]));
			assert.strictEqual(component.definitions, definitions);
			assert.strictEqual(getRootSchemaDerivedData(root).treeSchema.definitions, definitions);
			assert.deepEqual([...reads.values()], [1, 1]);
			assert.equal(dependency.definitions.size, 1);
			assert.deepEqual([...reads.values()], [1, 2]);
			assert.equal(Reflect.set(component, "definitions", new Map()), false);
		});
		for (const first of [0, 1, 2]) {
			it(`shares reachable definitions when queried from ${first} first`, () => {
				const [a, b, parent] = createSchemaGraph([[1], [0], [1]]);
				assert(a !== undefined && b !== undefined && parent !== undefined);
				getRootSchemaDerivedData([a, b, parent][first] ?? assert.fail());
				const aData = getRootSchemaDerivedData(a);
				const bData = getRootSchemaDerivedData(b);
				const aComponent = getCachedRootSchemaDerivedData(a)?.component ?? assert.fail();
				assert.strictEqual(aComponent, getCachedRootSchemaDerivedData(b)?.component);
				assert.strictEqual(aData.treeSchema.definitions, bData.treeSchema.definitions);
				assert.notStrictEqual(aData.treeSchema.root, bData.treeSchema.root);
				assert.deepEqual(
					new Set(aData.treeSchema.definitions.keys()),
					new Set([a.identifier, b.identifier]),
				);
			});
		}
		it("handles overlapping unions and empty roots", () => {
			const [a, b, c, d] = createSchemaGraph([[1, 2], [3], [3], []]);
			assert(a !== undefined && b !== undefined && c !== undefined && d !== undefined);
			const data = getRootSchemaDerivedData(a);
			assert.equal(data.treeSchema.definitions.size, 4);
			assert.equal(getRootSchemaDerivedData([b, c]).treeSchema.definitions.size, 3);
			const empty = getRootSchemaDerivedData([]);
			assert.equal(empty.treeSchema.definitions.size, 0);
			assert.equal(empty.hasStagedSchema, false);
		});
		it("deduplicates dependencies on different members of the same component", () => {
			const [root, a, b] = createSchemaGraph([[1, 2, 1], [2], [1]]);
			assert(root !== undefined && a !== undefined && b !== undefined);
			getRootSchemaDerivedData(root);
			const rootComponent = getCachedRootSchemaDerivedData(root)?.component ?? assert.fail();
			const dependency = getCachedRootSchemaDerivedData(a)?.component ?? assert.fail();
			assert.strictEqual(dependency, getCachedRootSchemaDerivedData(b)?.component);
			assert.deepEqual(rootComponent.members, [root]);
			assert.deepEqual(new Set(dependency.members), new Set([a, b]));
			assert.deepEqual(rootComponent.dependencies, new Set([dependency]));
			assert.equal(dependency.dependencies.size, 0);
		});
		it("publishes only completed dependencies when later discovery fails", () => {
			const sf = new SchemaFactoryAlpha("failure");
			class Good extends sf.object("Good", {}) {}
			class Bad extends sf.objectRecursive("Bad", {
				child: sf.optionalRecursive([
					() => {
						throw new Error("lazy failure");
					},
				]),
			}) {}
			class Parent extends sf.object("Parent", { good: Good, bad: Bad }) {}
			for (let i = 0; i < 2; i++) {
				// Existing lazy evaluation is not retryable after a throwing initializer.
				assert.throws(
					() => getRootSchemaDerivedData(Parent),
					i === 0 ? /lazy failure/ : TypeError,
				);
				assert.equal(getCachedRootSchemaDerivedData(Parent)?.component, undefined);
				assert.equal(getCachedRootSchemaDerivedData(Bad)?.component, undefined);
				assert.notEqual(getCachedRootSchemaDerivedData(Good)?.component, undefined);
			}
			assert.equal(getRootSchemaDerivedData(Good).treeSchema.definitions.size, 1);
		});
		it("rechecks identifier conflicts when combining cached components", () => {
			const sf = new SchemaFactoryAlpha("conflicts");
			class A extends sf.object("Duplicate", {}) {}
			class B extends sf.object("Duplicate", {}) {}
			for (const node of [A, B]) {
				getRootSchemaDerivedData(node);
			}
			class Parent extends sf.object("Parent", { a: A, b: B }) {}
			analyzeSchema(Parent);
			const component = getCachedRootSchemaDerivedData(Parent)?.component ?? assert.fail();
			for (let i = 0; i < 2; i++) {
				assert.throws(
					() => component.definitions,
					validateUsageError(/Multiple schema encountered/),
				);
				assert.throws(
					() => getRootSchemaDerivedData(Parent),
					validateUsageError(/Multiple schema encountered/),
				);
				assert.throws(
					() => getRootSchemaDerivedData([A, B]),
					validateUsageError(/Multiple schema encountered/),
				);
			}
			assert.equal(getRootSchemaDerivedData(A).treeSchema.definitions.size, 1);
			assert.equal(getRootSchemaDerivedData(B).treeSchema.definitions.size, 1);
		});
		it("does not bypass most-derived validation after analysis", () => {
			const sf = new SchemaFactoryAlpha("mostDerived");
			const Base = sf.object("Base", {});
			class A extends Base {}
			class B extends Base {}
			getRootSchemaDerivedData(A);
			assert.throws(
				() => getRootSchemaDerivedData(B),
				validateUsageError(/Two schema classes were used/),
			);
		});
		for (const cycle of [false, true]) {
			it(`analyzes a deep ${cycle ? "cycle" : "chain"} including lazy evaluation`, () => {
				const depth = 5000;
				const nodes = createSchemaGraph(
					Array.from({ length: depth }, (_, i) =>
						i + 1 < depth ? [i + 1] : cycle ? [0] : [],
					),
				);
				const root = nodes[0] ?? assert.fail();
				const data = getRootSchemaDerivedData(root);
				assert.equal(data.treeSchema.definitions.size, depth);
				assert.equal(data.hasStagedSchema, false);
				assert.equal(
					getCachedRootSchemaDerivedData(root)?.component?.members.length,
					cycle ? depth : 1,
				);
			});
		}
		describe("staging reachability", () => {
			for (const staged of [false, true]) {
				for (const descendantFirst of [false, true]) {
					it(`reuses descendant analysis (${staged ? "staged" : "unstaged"}, ${descendantFirst ? "C" : "B"} first)`, () => {
						const sf = new SchemaFactoryAlpha("stagingDescendants");
						class C extends sf.object("C", {
							value: staged ? sf.stagedOptional(sf.number) : sf.optional(sf.number),
						}) {}
						class B extends sf.object("B", { child: C }) {}
						class A extends sf.object("A", { child: B }) {}
						let bReads = 0;
						let cReads = 0;
						const bSchema = B;
						const cSchema = C;
						assert(isObjectNodeSchema(bSchema));
						assert(isObjectNodeSchema(cSchema));
						const bFields = bSchema.fields;
						const cFields = cSchema.fields;
						// Count staging-annotation inspections. Root identifier checks still run, but reuse completed component analysis.
						Object.defineProperty(B, "fields", {
							get() {
								bReads++;
								return bFields;
							},
						});
						Object.defineProperty(C, "fields", {
							get() {
								cReads++;
								return cFields;
							},
						});

						assert.equal(
							getCachedRootSchemaDerivedData(B)?.component?.hasStagedSchema,
							undefined,
						);
						assert.equal(
							getCachedRootSchemaDerivedData(C)?.component?.hasStagedSchema,
							undefined,
						);
						if (descendantFirst) {
							assert.equal(getRootSchemaDerivedData(C).hasStagedSchema, staged);
						}
						assert.equal(getRootSchemaDerivedData(B).hasStagedSchema, staged);
						assert.equal(
							getCachedRootSchemaDerivedData(B)?.component?.hasStagedSchema,
							staged,
						);
						assert.equal(
							getCachedRootSchemaDerivedData(C)?.component?.hasStagedSchema,
							staged,
						);
						assert.equal(getRootSchemaDerivedData(C).hasStagedSchema, staged);
						assert.equal(getRootSchemaDerivedData(A).hasStagedSchema, staged);
						assert.equal(
							getCachedRootSchemaDerivedData(A)?.component?.hasStagedSchema,
							staged,
						);
						assert.equal(bReads, 1);
						assert.equal(cReads, 1);
					});
				}
			}
			for (const reverse of [false, true]) {
				it(`detects staging through a cycle (${reverse ? "B" : "A"} first)`, () => {
					const sf = new SchemaFactoryAlpha("stagingCycle");
					class A extends sf.objectRecursive("A", {
						child: sf.optionalRecursive([() => B]),
						staged: sf.stagedOptional(sf.number),
					}) {}
					class B extends sf.objectRecursive("B", {
						child: sf.optionalRecursive([() => A]),
					}) {}

					// Both roots reach A's staged field; visiting the cycle must not cache an incomplete negative answer for B.
					for (const root of reverse ? [B, A] : [A, B]) {
						assert.equal(getRootSchemaDerivedData(root).hasStagedSchema, true);
						assert.equal(getCachedRootSchemaDerivedData(A)?.component?.hasStagedSchema, true);
						assert.equal(getCachedRootSchemaDerivedData(B)?.component?.hasStagedSchema, true);
					}
				});
			}
			it("resolves unstaged cycles separately from staged ancestors and cycles", () => {
				const sf = new SchemaFactoryAlpha("stagingComponents");
				class Unstaged extends sf.objectRecursive("Unstaged", {
					child: sf.optionalRecursive([() => Unstaged]),
				}) {}
				class A extends sf.objectRecursive("A", {
					child: sf.optionalRecursive([() => B]),
					unstaged: sf.optional(Unstaged),
				}) {}
				class B extends sf.objectRecursive("B", {
					child: sf.optionalRecursive([() => A]),
					staged: sf.stagedOptional(sf.number),
				}) {}
				class Parent extends sf.object("Parent", { child: A }) {}

				assert.equal(getRootSchemaDerivedData(Parent).hasStagedSchema, true);
				for (const node of [Parent, A, B]) {
					assert.equal(getCachedRootSchemaDerivedData(node)?.component?.hasStagedSchema, true);
				}
				assert.equal(
					getCachedRootSchemaDerivedData(Unstaged)?.component?.hasStagedSchema,
					false,
				);
				assert.equal(getRootSchemaDerivedData(Unstaged).hasStagedSchema, false);
			});
			it("attributes staged references to the parent, not the referenced class", () => {
				const sf = new SchemaFactoryAlpha("stagingReference");
				class Child extends sf.object("Child", {}) {}
				class Parent extends sf.objectAlpha("Parent", {
					child: sf.types([sf.staged(Child)]),
				}) {}

				assert.equal(getRootSchemaDerivedData(Parent).hasStagedSchema, true);
				assert.equal(getCachedRootSchemaDerivedData(Parent)?.component?.hasStagedSchema, true);
				assert.equal(getCachedRootSchemaDerivedData(Child)?.component?.hasStagedSchema, false);
				assert.equal(getRootSchemaDerivedData(Child).hasStagedSchema, false);
			});
			it("does not confuse root staging with staging in the referenced node", () => {
				const sf = new SchemaFactoryAlpha("stagingRoot");
				const optional = sf.stagedOptional(sf.number);
				const allowedTypes = sf.types([sf.number, sf.staged(sf.string)]);
				assert.equal(getRootSchemaDerivedData(optional).hasStagedSchema, true);
				assert.equal(getRootSchemaDerivedData(allowedTypes).hasStagedSchema, true);
				assert.equal(getRootSchemaDerivedData(sf.number).hasStagedSchema, false);
				assert.equal(getRootSchemaDerivedData(sf.string).hasStagedSchema, false);
			});
			for (const testCase of testSchema) {
				it(testCase.name, () => {
					const data = getRootSchemaDerivedData(testCase.schema);
					assert.equal(data.hasStagedSchema, testCase.hasStagedSchema === true);
					for (const node of data.treeSchema.definitions.values()) {
						assert.equal(
							getCachedRootSchemaDerivedData(node)?.component?.hasStagedSchema,
							getStagedSchemaUpgrades(node).size > 0,
							`Incorrect cached staging reachability for ${node.identifier}`,
						);
					}
				});
			}
		});
	});
});
