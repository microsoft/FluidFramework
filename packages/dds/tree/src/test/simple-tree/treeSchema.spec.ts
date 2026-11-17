/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import {
	getTreeNodeSchemaPrivateData,
	StagedSchemaUpgradePolicy,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/core/index.js";
import {
	type ImplicitFieldSchema,
	isSchemaUpgradeAllowed,
	normalizeFieldSchema,
	SchemaFactoryAlpha,
} from "../../simple-tree/index.js";
import {
	hasCachedRootSchemaDerivedDataForTesting,
	hasCachedSchemaComponentForTesting,
	createTreeSchema,
	getSchemaUpgradeCandidate,
	getRootSchemaDerivedData,
	SchemaComponent,
	toInitialSchema,
	type TransitiveSchemaInfo,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/treeSchema.js";
import { oneFromIterable } from "../../util/index.js";
import { getStagedSchemaUpgrades, testSchema } from "../testTrees.js";
import { expectSchemaEqual } from "../utils.js";
import { createSchemaGraph } from "./schemaTestUtils.js";

// Configuration-specific validation is covered in api/configuration.spec.ts.
// View-only stored conversion and context integration are covered in toStoredSchema.spec.ts and createContext.spec.ts.
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
	describe("SchemaComponent.fromSchema", () => {
		it("caches node components without allocating root-derived data", () => {
			const [parent, child] = createSchemaGraph([[1], []]);
			assert(parent !== undefined && child !== undefined);
			SchemaComponent.fromSchema(parent);
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
		it("skips completed subgraphs when discovering a new ancestor", () => {
			const [parent, child, leaf] = createSchemaGraph([[1], [2], []]);
			assert(parent !== undefined && child !== undefined && leaf !== undefined);
			const childComponent = SchemaComponent.fromSchema(child);
			for (const node of [child, leaf]) {
				Object.defineProperty(getTreeNodeSchemaPrivateData(node), "childAllowedTypes", {
					get: () => assert.fail("Completed components must not be traversed again"),
				});
			}
			const parentComponent = SchemaComponent.fromSchema(parent);
			assert.deepEqual(parentComponent.dependencies, new Set([childComponent]));
			assert.deepEqual(
				new Set(parentComponent.definitions.values()),
				new Set([parent, child, leaf]),
			);
			assert.strictEqual(SchemaComponent.fromSchema(child), childComponent);
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
		it("resolves repeated roots and cycle members through the component cache", () => {
			const [a, b, other] = createSchemaGraph([[1], [0], []]);
			assert(a !== undefined && b !== undefined && other !== undefined);
			const cold = getRootSchemaDerivedData([a, b, other, a]);
			assert.equal(cold.components.size, 2);
			assert.deepEqual(new Set(cold.definitions.values()), new Set([a, b, other]));
			const warm = getRootSchemaDerivedData([other, b, a, b]);
			assert.equal(warm.components.size, cold.components.size);
			for (const component of cold.components) {
				assert(warm.components.has(component));
			}
			assert.deepEqual(new Set(warm.definitions.values()), new Set([a, b, other]));
			assert.strictEqual(SchemaComponent.fromSchema(a), SchemaComponent.fromSchema(b));
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
			const readsAfterMaterialization = new Map(reads);
			assert([...reads.values()].every((count) => count > 0));
			assert.deepEqual(new Set(definitions.values()), new Set([root, child]));
			assert.strictEqual(component.definitions, definitions);
			assert.strictEqual(getRootSchemaDerivedData(root).treeSchema.definitions, definitions);
			assert.deepEqual([...reads.values()], [...readsAfterMaterialization.values()]);
			const dependencyReads = reads.get(dependency) ?? assert.fail();
			assert.equal(dependency.definitions.size, 1);
			assert((reads.get(dependency) ?? assert.fail()) > dependencyReads);
			assert.equal(reads.get(component), readsAfterMaterialization.get(component));
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
		it("propagates lazy schema evaluation errors", () => {
			const sf = new SchemaFactoryAlpha("failure");
			class Bad extends sf.objectRecursive("Bad", {
				child: sf.optionalRecursive([
					() => {
						throw new Error("lazy failure");
					},
				]),
			}) {}
			assert.throws(() => getRootSchemaDerivedData(Bad), /lazy failure/);
		});
		for (const lookup of ["component", "root", "union"] as const) {
			it(`checks identifier conflicts when combining cached components for a ${lookup}`, () => {
				const sf = new SchemaFactoryAlpha("conflicts");
				class A extends sf.object("Duplicate", {}) {}
				class B extends sf.object("Duplicate", {}) {}
				for (const node of [A, B]) {
					getRootSchemaDerivedData(node);
				}
				class Parent extends sf.object("Parent", { a: A, b: B }) {}
				assert.throws(
					() =>
						lookup === "component"
							? SchemaComponent.fromSchema(Parent)
							: getRootSchemaDerivedData(lookup === "root" ? Parent : [A, B]),
					validateUsageError(/Multiple schema encountered/),
				);
			});
		}
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

						assert.equal(hasCachedSchemaComponentForTesting(B), false);
						assert.equal(hasCachedSchemaComponentForTesting(C), false);
						if (descendantFirst) {
							assert.equal(getRootSchemaDerivedData(C).hasStagedSchema, staged);
						}
						assert.equal(getRootSchemaDerivedData(B).hasStagedSchema, staged);
						assert.equal(hasCachedSchemaComponentForTesting(C), true);
						const bComponent = SchemaComponent.fromSchema(B);
						const cComponent = SchemaComponent.fromSchema(C);
						assert.equal(bComponent.hasStagedSchema, staged);
						assert.equal(cComponent.hasStagedSchema, staged);
						assert.equal(getRootSchemaDerivedData(C).hasStagedSchema, staged);
						assert.equal(getRootSchemaDerivedData(A).hasStagedSchema, staged);
						assert.equal(SchemaComponent.fromSchema(A).hasStagedSchema, staged);
						assert.equal(SchemaComponent.fromSchema(B), bComponent);
						assert.equal(SchemaComponent.fromSchema(C), cComponent);
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

	describe("getSchemaUpgradeCandidate", () => {
		const schemaFactory = new SchemaFactoryAlpha("upgradeTarget");

		// Reuse stored identifiers to model different application versions.
		// Each view contains only one declaration for each identifier.

		it("returns an equivalent target when the schemas match", () => {
			class Task extends schemaFactory.object("Task", { title: schemaFactory.string }) {}
			const viewSchema = createTreeSchema(Task);
			const storedSchema = toInitialSchema(Task);
			const result = getSchemaUpgradeCandidate(
				viewSchema,
				storedSchema,
				StagedSchemaUpgradePolicy.restrictive,
			);

			expectSchemaEqual(result, storedSchema);
		});

		for (const location of ["root", "array", "map"] as const) {
			it(`composes stored allowed types without changing cached view-only schemas (${location})`, () => {
				const priorities = [schemaFactory.number, schemaFactory.string] as const;
				const stagedUnassigned = schemaFactory.staged(schemaFactory.null);
				const unassignedUpgrade = stagedUnassigned.metadata.stagedSchemaUpgrade;
				assert(unassignedUpgrade !== undefined);
				const stagedPriorities = schemaFactory.types([
					schemaFactory.number,
					schemaFactory.staged(schemaFactory.string),
					stagedUnassigned,
				]);
				const before: ImplicitFieldSchema =
					location === "root"
						? stagedPriorities
						: location === "array"
							? schemaFactory.array("Priorities", stagedPriorities)
							: schemaFactory.map("Priorities", stagedPriorities);

				// Fully enable string priorities in the later schema, without shipping the staged `null` alternative.
				const after: ImplicitFieldSchema =
					location === "root"
						? priorities
						: location === "array"
							? schemaFactory.array("Priorities", priorities)
							: schemaFactory.map("Priorities", priorities);

				const policy = StagedSchemaUpgradePolicy.enabledStagedUpgrades(unassignedUpgrade);

				// The older view enables `null` while opening a newer document; its candidate must also retain stored strings.
				const expectedTypes = [schemaFactory.number, schemaFactory.string, schemaFactory.null];
				const expectedCandidate: ImplicitFieldSchema =
					location === "root"
						? expectedTypes
						: location === "array"
							? schemaFactory.array("Priorities", expectedTypes)
							: schemaFactory.map("Priorities", expectedTypes);

				// The older view's own conversion includes numbers and the selected `null` type, but not its disabled staged string type.
				// Do not use the cached conversion itself as the expectation: an accidental mutation would change both.
				const freshTypes = [schemaFactory.number, schemaFactory.null];
				const expectedFresh: ImplicitFieldSchema =
					location === "root"
						? freshTypes
						: location === "array"
							? schemaFactory.array("Priorities", freshTypes)
							: schemaFactory.map("Priorities", freshTypes);
				const stored = toInitialSchema(after);
				const storedSnapshot = structuredClone(stored);
				const fresh = toInitialSchema(before, policy);
				const result = getSchemaUpgradeCandidate(createTreeSchema(before), stored, policy);

				expectSchemaEqual(result, toInitialSchema(expectedCandidate));
				assert.deepEqual(structuredClone(stored), storedSnapshot);

				// Neither the cached conversion nor a candidate for another document may inherit this document's enabled string upgrade.
				expectSchemaEqual(toInitialSchema(before, policy), toInitialSchema(expectedFresh));
				expectSchemaEqual(
					getSchemaUpgradeCandidate(createTreeSchema(before), fresh, policy),
					toInitialSchema(expectedFresh),
				);
			});
		}

		it("composes object fields by stored key without enabling other fields that share their tokens", () => {
			const stagedString = schemaFactory.staged(schemaFactory.string);
			const stagedPriorities = schemaFactory.types([schemaFactory.number, stagedString]);
			const stagedHours = schemaFactory.stagedOptional(schemaFactory.number);
			class Before extends schemaFactory.object("Task", {
				priority: schemaFactory.required(stagedPriorities, {
					key: "primaryPriority",
					persistedMetadata: { label: "Earlier priority label" },
				}),
				fallbackPriority: stagedPriorities,
				primaryHours: stagedHours,
				fallbackHours: stagedHours,
			}) {}

			// Fully enable the primary fields' staged changes, leave fallback fields numeric and required, and rename the property.
			// Keep the primary field's stored key while updating its metadata.
			class After extends schemaFactory.object("Task", {
				primaryPriority: schemaFactory.required([schemaFactory.number, schemaFactory.string], {
					persistedMetadata: { label: "Later priority label" },
				}),
				fallbackPriority: schemaFactory.number,
				primaryHours: schemaFactory.optional(schemaFactory.number),
				fallbackHours: schemaFactory.number,
			}) {}

			// The older view retains the newer document's enabled upgrades at the primary fields, using the older view's field metadata.
			// Sharing the staged tokens does not enable either upgrade at the fallback fields.
			class Expected extends schemaFactory.object("Task", {
				primaryPriority: schemaFactory.required([schemaFactory.number, schemaFactory.string], {
					persistedMetadata: { label: "Earlier priority label" },
				}),
				fallbackPriority: schemaFactory.number,
				primaryHours: schemaFactory.optional(schemaFactory.number),
				fallbackHours: schemaFactory.number,
			}) {}
			const stored = toInitialSchema(After);
			const storedSnapshot = structuredClone(stored);
			const cachedSnapshot = structuredClone(toInitialSchema(Before));
			const result = getSchemaUpgradeCandidate(
				createTreeSchema(Before),
				stored,
				StagedSchemaUpgradePolicy.restrictive,
			);

			expectSchemaEqual(result, toInitialSchema(Expected));

			// Compare independent data snapshots so mutations to shared field maps, type sets, or metadata cannot pass unnoticed.
			assert.deepEqual(structuredClone(stored), storedSnapshot);
			assert.deepEqual(structuredClone(toInitialSchema(Before)), cachedSnapshot);
		});

		it("retains stored allowed types omitted from a declared field's view types", () => {
			class Before extends schemaFactory.object("Task", {
				priority: [schemaFactory.number, schemaFactory.string],
			}) {}

			// Drop string priorities from the application declaration without staging them.
			class After extends schemaFactory.object("Task", {
				priority: schemaFactory.number,
			}) {}
			const stored = toInitialSchema(Before);
			const result = getSchemaUpgradeCandidate(
				createTreeSchema(After),
				stored,
				StagedSchemaUpgradePolicy.restrictive,
			);

			// Candidate construction preserves strings even though the view does not declare them.
			// Deciding whether that candidate is usable belongs to the compatibility layer.
			expectSchemaEqual(result, stored);
		});

		it("uses the view's candidate when its stored node kind differs", () => {
			class Before extends schemaFactory.object("TaskLabels", {
				owner: schemaFactory.optional(schemaFactory.string),
			}) {}

			// Replace a fixed set of label fields with arbitrary string-valued entries under the same stored identifier.
			class After extends schemaFactory.map("TaskLabels", schemaFactory.string) {}
			const result = getSchemaUpgradeCandidate(
				createTreeSchema(After),
				toInitialSchema(Before),
				StagedSchemaUpgradePolicy.restrictive,
			);

			// Object fields are not composed into a map definition; the candidate keeps the map representation selected by the view.
			expectSchemaEqual(result, toInitialSchema(After));
		});

		it("preserves an optional root when the view stages optionality", () => {
			class Task extends schemaFactory.object("Task", { title: schemaFactory.string }) {}
			const before = schemaFactory.stagedOptional(Task);

			// Fully enable optionality so documents created by the later schema can have an empty root.
			const after = schemaFactory.optional(Task);
			const stored = toInitialSchema(after);
			const result = getSchemaUpgradeCandidate(
				createTreeSchema(before),
				stored,
				StagedSchemaUpgradePolicy.restrictive,
			);

			// The older view's restrictive candidate retains the staged optionality already enabled for the root.
			expectSchemaEqual(result, stored);
			expectSchemaEqual(toInitialSchema(before), toInitialSchema(Task));
		});

		/**
		 * V1 stages `Task` alongside numbers.
		 * V2 enables `Task`, which references itself and has a required `Child` containing a string.
		 * Opening V2's schema with V1's restrictive policy must restore all three definitions without repeating traversal around the cycle.
		 */
		it("retains descendants and recursive references of an already-enabled staged root type", () => {
			class Child extends schemaFactory.object("Child", {
				text: schemaFactory.string,
			}) {}
			class Task extends schemaFactory.objectRecursive("Task", {
				child: Child,
				next: schemaFactory.optionalRecursive([() => Task]),
			}) {}
			const schemaV1 = schemaFactory.types([schemaFactory.number, schemaFactory.staged(Task)]);
			const schemaV2 = [schemaFactory.number, Task] as const;
			const view = createTreeSchema(schemaV1);
			const initial = toInitialSchema(schemaV1);
			const stored = toInitialSchema(schemaV2);

			// Only number is initially queued; neither descendant can be recovered from a root reference.
			assert.deepEqual(
				new Set(initial.nodeSchema.keys()),
				new Set([schemaFactory.number.identifier]),
			);
			const candidate = getSchemaUpgradeCandidate(
				view,
				stored,
				StagedSchemaUpgradePolicy.restrictive,
			);
			assert.deepEqual(
				new Set(candidate.nodeSchema.keys()),
				new Set([
					schemaFactory.number.identifier,
					Task.identifier,
					Child.identifier,
					schemaFactory.string.identifier,
				]),
			);
			expectSchemaEqual(candidate, stored);
			assert.equal(isSchemaUpgradeAllowed(view, stored, candidate), true);
		});
	});
});
