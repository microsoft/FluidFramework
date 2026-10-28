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
	hasCachedRootSchemaDerivedDataForTesting,
	hasCachedSchemaComponentForTesting,
	createTreeSchema,
	getRootSchemaDerivedData,
	SchemaComponent,
	type TransitiveSchemaInfo,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/treeSchema.js";
import { oneFromIterable } from "../../util/index.js";
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
			assert.equal(hasCachedRootSchemaDerivedDataForTesting(a), false);
			assert.equal(hasCachedRootSchemaDerivedDataForTesting(b), false);
			assert.equal(hasCachedSchemaComponentForTesting(a), false);
			assert.equal(hasCachedSchemaComponentForTesting(b), false);
		});
	});
	describe("analyzeSchema", () => {
		it("caches node components without allocating root-derived data", () => {
			const [parent, child] = createSchemaGraph([[1], []]);
			assert(parent !== undefined && child !== undefined);
			analyzeSchema(parent);
			for (const node of [parent, child]) {
				assert.equal(hasCachedSchemaComponentForTesting(node), true);
				assert.equal(hasCachedRootSchemaDerivedDataForTesting(node), false);
				assert(SchemaComponent.fromSchema(node));
				assert.equal(hasCachedRootSchemaDerivedDataForTesting(node), false);
			}
			getRootSchemaDerivedData(parent);
			assert.equal(hasCachedRootSchemaDerivedDataForTesting(parent), true);
			assert.equal(hasCachedRootSchemaDerivedDataForTesting(child), false);
		});
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
		it("shares a single component's definitions, including unions of its members", () => {
			const [a, b] = createSchemaGraph([[1], [0]]);
			assert(a !== undefined && b !== undefined);
			const component = SchemaComponent.fromSchema(a);
			for (const root of [b, [a], [a, b], normalizeFieldSchema(a)]) {
				const data = getRootSchemaDerivedData(root);
				assert.deepEqual(data.components, new Set([component]));
				assert.strictEqual(data.definitions, component.definitions);
				assert.strictEqual(data.treeSchema.definitions, component.definitions);
			}
		});
		it("owns empty definitions without a component for empty roots", () => {
			const root: [] = [];
			const data = getRootSchemaDerivedData(root);
			assert.equal(data.components.size, 0);
			assert.equal(data.definitions.size, 0);
			assert.strictEqual(data.treeSchema.definitions, data.definitions);
			assert.strictEqual(getRootSchemaDerivedData(root), data);
		});
		it("owns combined definitions for a union of different components", () => {
			const [a, b, child] = createSchemaGraph([[2], [2], []]);
			assert(a !== undefined && b !== undefined && child !== undefined);
			const root = [a, b];
			const data = getRootSchemaDerivedData(root);
			assert.deepEqual(
				data.components,
				new Set([SchemaComponent.fromSchema(a), SchemaComponent.fromSchema(b)]),
			);
			assert.deepEqual(new Set(data.definitions.values()), new Set([a, b, child]));
			assert.strictEqual(data.treeSchema.definitions, data.definitions);
			assert.strictEqual(getRootSchemaDerivedData(root), data);
		});
		it("lazily caches component definitions without materializing descendant maps", () => {
			const [parent, root, child] = createSchemaGraph([[1], [2], []]);
			assert(parent !== undefined && root !== undefined && child !== undefined);
			const parentComponent = SchemaComponent.fromSchema(parent);
			const component = oneFromIterable(parentComponent.dependencies) ?? assert.fail();
			const dependency = oneFromIterable(component.dependencies) ?? assert.fail();
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

			assert.equal(hasCachedSchemaComponentForTesting(root), true);
			assert.equal(hasCachedSchemaComponentForTesting(child), true);
			assert.deepEqual([...reads.values()], [0, 0]);
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
				assert.deepEqual(aData.components, bData.components);
				assert.strictEqual(SchemaComponent.fromSchema(a), SchemaComponent.fromSchema(b));
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
			const rootComponent = SchemaComponent.fromSchema(root);
			assert.equal(hasCachedSchemaComponentForTesting(a), true);
			assert.equal(hasCachedSchemaComponentForTesting(b), true);
			const dependency = SchemaComponent.fromSchema(a);
			assert.strictEqual(dependency, SchemaComponent.fromSchema(b));
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
				assert.equal(hasCachedSchemaComponentForTesting(Parent), false);
				assert.equal(hasCachedSchemaComponentForTesting(Bad), false);
				assert.equal(hasCachedSchemaComponentForTesting(Good), true);
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
			assert.equal(hasCachedSchemaComponentForTesting(Parent), true);
			assert.equal(hasCachedRootSchemaDerivedDataForTesting(Parent), false);
			for (let i = 0; i < 2; i++) {
				assert.throws(
					() => getRootSchemaDerivedData(Parent),
					validateUsageError(/Multiple schema encountered/),
				);
				assert.equal(hasCachedSchemaComponentForTesting(Parent), true);
				assert.throws(
					() => SchemaComponent.fromSchema(Parent),
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
				assert.equal(SchemaComponent.fromSchema(root).members.length, cycle ? depth : 1);
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

						assert.equal(hasCachedSchemaComponentForTesting(B), false);
						assert.equal(hasCachedSchemaComponentForTesting(C), false);
						if (descendantFirst) {
							assert.equal(getRootSchemaDerivedData(C).hasStagedSchema, staged);
						}
						assert.equal(getRootSchemaDerivedData(B).hasStagedSchema, staged);
						assert.equal(hasCachedSchemaComponentForTesting(C), true);
						assert.equal(SchemaComponent.fromSchema(B).hasStagedSchema, staged);
						assert.equal(SchemaComponent.fromSchema(C).hasStagedSchema, staged);
						assert.equal(getRootSchemaDerivedData(C).hasStagedSchema, staged);
						assert.equal(getRootSchemaDerivedData(A).hasStagedSchema, staged);
						assert.equal(SchemaComponent.fromSchema(A).hasStagedSchema, staged);
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
						assert.equal(hasCachedSchemaComponentForTesting(A), true);
						assert.equal(hasCachedSchemaComponentForTesting(B), true);
						assert.equal(SchemaComponent.fromSchema(A).hasStagedSchema, true);
						assert.equal(SchemaComponent.fromSchema(B).hasStagedSchema, true);
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
					assert.equal(hasCachedSchemaComponentForTesting(node), true);
					assert.equal(SchemaComponent.fromSchema(node).hasStagedSchema, true);
				}
				assert.equal(hasCachedSchemaComponentForTesting(Unstaged), true);
				assert.equal(SchemaComponent.fromSchema(Unstaged).hasStagedSchema, false);
				assert.equal(getRootSchemaDerivedData(Unstaged).hasStagedSchema, false);
			});
			it("attributes staged references to the parent, not the referenced class", () => {
				const sf = new SchemaFactoryAlpha("stagingReference");
				class Child extends sf.object("Child", {}) {}
				class Parent extends sf.objectAlpha("Parent", {
					child: sf.types([sf.staged(Child)]),
				}) {}

				assert.equal(getRootSchemaDerivedData(Parent).hasStagedSchema, true);
				assert.equal(SchemaComponent.fromSchema(Parent).hasStagedSchema, true);
				assert.equal(hasCachedSchemaComponentForTesting(Child), true);
				assert.equal(SchemaComponent.fromSchema(Child).hasStagedSchema, false);
				assert.equal(getRootSchemaDerivedData(Child).hasStagedSchema, false);
			});
			it("does not confuse root staging with staging in the referenced node", () => {
				const sf = new SchemaFactoryAlpha("stagingRoot");
				const optional = sf.stagedOptional(sf.number);
				const allowedTypes = sf.types([sf.number, sf.staged(sf.string)]);
				for (const root of [optional, allowedTypes, sf.stagedOptional([])]) {
					const data = getRootSchemaDerivedData(root);
					assert.equal(data.hasStagedSchema, true);
					for (const dependency of data.components) {
						assert.equal(dependency.hasStagedSchema, false);
					}
				}
				assert.equal(getRootSchemaDerivedData(sf.number).hasStagedSchema, false);
				assert.equal(getRootSchemaDerivedData(sf.string).hasStagedSchema, false);
			});
			for (const stagedFirst of [false, true]) {
				it(`shares node data without sharing root staging (${stagedFirst})`, () => {
					const sf = new SchemaFactoryAlpha("singleStagedRoot");
					class Node extends sf.object("Node", {}) {}
					const root = sf.types([sf.staged(Node)]);
					if (stagedFirst) {
						getRootSchemaDerivedData(root);
					}
					const node = getRootSchemaDerivedData(Node);
					const staged = getRootSchemaDerivedData(root);
					const component = SchemaComponent.fromSchema(Node);
					assert.deepEqual(staged.components, new Set([component]));
					assert.deepEqual(staged.components, node.components);
					const schemas: readonly (readonly [TransitiveSchemaInfo, boolean])[] = [
						[component, false],
						[node, false],
						[staged, true],
					];
					for (const [info, hasStaging] of schemas) {
						assert.equal(info.hasStagedSchema, hasStaging);
						assert.strictEqual(info.definitions, component.definitions);
						assert.strictEqual(info.context, component.context);
					}
					assert.strictEqual(staged.treeSchema.definitions, node.treeSchema.definitions);
					assert.strictEqual(staged.context, node.context);
				});
			}
			for (const testCase of testSchema) {
				it(testCase.name, () => {
					const data = getRootSchemaDerivedData(testCase.schema);
					assert.equal(data.hasStagedSchema, testCase.hasStagedSchema === true);
					const components = new Set(data.components);
					for (const component of components) {
						for (const node of component.members) {
							assert.equal(hasCachedSchemaComponentForTesting(node), true);
							assert.equal(
								component.hasStagedSchema,
								getStagedSchemaUpgrades(node).size > 0,
								`Incorrect cached staging reachability for ${node.identifier}`,
							);
						}
						for (const dependency of component.dependencies) {
							components.add(dependency);
						}
					}
				});
			}
		});
	});
});
