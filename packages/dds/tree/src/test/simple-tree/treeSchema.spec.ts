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
			assert.equal(getTreeNodeSchemaPrivateData(a).component, undefined);
			assert.equal(getTreeNodeSchemaPrivateData(b).component, undefined);
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
		for (const first of [0, 1, 2]) {
			it(`shares reachable definitions when queried from ${first} first`, () => {
				const [a, b, parent] = createSchemaGraph([[1], [0], [1]]);
				assert(a !== undefined && b !== undefined && parent !== undefined);
				getRootSchemaDerivedData([a, b, parent][first] ?? assert.fail());
				const aData = getRootSchemaDerivedData(a);
				const bData = getRootSchemaDerivedData(b);
				const aComponent = getTreeNodeSchemaPrivateData(a).component ?? assert.fail();
				assert.strictEqual(aComponent, getTreeNodeSchemaPrivateData(b).component);
				assert.strictEqual(aData.treeSchema.definitions, bData.treeSchema.definitions);
				assert.notStrictEqual(aData.treeSchema.root, bData.treeSchema.root);
				assert.equal(aData.unhydratedContext, undefined);
				assert.equal(bData.unhydratedContext, undefined);
				assert.deepEqual(
					new Set(aData.treeSchema.definitions.keys()),
					new Set([a.identifier, b.identifier]),
				);
			});
		}
		it("materializes only requested closures, including overlapping unions and empty roots", () => {
			const [a, b, c, d] = createSchemaGraph([[1, 2], [3], [3], []]);
			assert(a !== undefined && b !== undefined && c !== undefined && d !== undefined);
			const data = getRootSchemaDerivedData(a);
			assert.equal(data.treeSchema.definitions.size, 4);
			for (const node of [b, c, d]) {
				const component = getTreeNodeSchemaPrivateData(node).component ?? assert.fail();
				assert.equal(component.definitions, undefined);
			}
			assert.equal(getRootSchemaDerivedData([b, c]).treeSchema.definitions.size, 3);
			assert.equal(getTreeNodeSchemaPrivateData(d).component?.definitions, undefined);
			const empty = getRootSchemaDerivedData([]);
			assert.equal(empty.treeSchema.definitions.size, 0);
			assert.equal(empty.hasStagedSchema, false);
		});
		it("deduplicates dependencies on different members of the same component", () => {
			const [root, a, b] = createSchemaGraph([[1, 2, 1], [2], [1]]);
			assert(root !== undefined && a !== undefined && b !== undefined);
			getRootSchemaDerivedData(root);
			const rootComponent = getTreeNodeSchemaPrivateData(root).component ?? assert.fail();
			const dependency = getTreeNodeSchemaPrivateData(a).component ?? assert.fail();
			assert.strictEqual(dependency, getTreeNodeSchemaPrivateData(b).component);
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
				assert.equal(getTreeNodeSchemaPrivateData(Parent).component, undefined);
				assert.equal(getTreeNodeSchemaPrivateData(Bad).component, undefined);
				assert.notEqual(getTreeNodeSchemaPrivateData(Good).component, undefined);
				assert.equal(getTreeNodeSchemaPrivateData(Good).component?.definitions, undefined);
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
			for (let i = 0; i < 2; i++) {
				assert.throws(
					() => getRootSchemaDerivedData(Parent),
					validateUsageError(/Multiple schema encountered/),
				);
				assert.throws(
					() => getRootSchemaDerivedData([A, B]),
					validateUsageError(/Multiple schema encountered/),
				);
				assert.equal(getTreeNodeSchemaPrivateData(Parent).component?.definitions, undefined);
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
					getTreeNodeSchemaPrivateData(root).component?.members.length,
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
							getTreeNodeSchemaPrivateData(B).component?.hasStagedSchema,
							undefined,
						);
						assert.equal(
							getTreeNodeSchemaPrivateData(C).component?.hasStagedSchema,
							undefined,
						);
						if (descendantFirst) {
							assert.equal(getRootSchemaDerivedData(C).hasStagedSchema, staged);
						}
						assert.equal(getRootSchemaDerivedData(B).hasStagedSchema, staged);
						assert.equal(getTreeNodeSchemaPrivateData(B).component?.hasStagedSchema, staged);
						assert.equal(getTreeNodeSchemaPrivateData(C).component?.hasStagedSchema, staged);
						assert.equal(getRootSchemaDerivedData(B).unhydratedContext, undefined);
						assert.equal(getRootSchemaDerivedData(C).hasStagedSchema, staged);
						assert.equal(getRootSchemaDerivedData(A).hasStagedSchema, staged);
						assert.equal(getTreeNodeSchemaPrivateData(A).component?.hasStagedSchema, staged);
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
						assert.equal(getTreeNodeSchemaPrivateData(A).component?.hasStagedSchema, true);
						assert.equal(getTreeNodeSchemaPrivateData(B).component?.hasStagedSchema, true);
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
					assert.equal(getTreeNodeSchemaPrivateData(node).component?.hasStagedSchema, true);
				}
				assert.equal(getTreeNodeSchemaPrivateData(Unstaged).component?.hasStagedSchema, false);
				assert.equal(getRootSchemaDerivedData(Unstaged).hasStagedSchema, false);
			});
			it("attributes staged references to the parent, not the referenced class", () => {
				const sf = new SchemaFactoryAlpha("stagingReference");
				class Child extends sf.object("Child", {}) {}
				class Parent extends sf.objectAlpha("Parent", {
					child: sf.types([sf.staged(Child)]),
				}) {}

				assert.equal(getRootSchemaDerivedData(Parent).hasStagedSchema, true);
				assert.equal(getTreeNodeSchemaPrivateData(Parent).component?.hasStagedSchema, true);
				assert.equal(getTreeNodeSchemaPrivateData(Child).component?.hasStagedSchema, false);
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
							getTreeNodeSchemaPrivateData(node).component?.hasStagedSchema,
							getStagedSchemaUpgrades(node).size > 0,
							`Incorrect cached staging reachability for ${node.identifier}`,
						);
					}
				});
			}
		});
	});
});
