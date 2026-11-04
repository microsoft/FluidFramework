/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";
import type { TreeStoredSchema } from "../../core/index.js";
import { allowsRepoSuperset, defaultSchemaPolicy } from "../../feature-libraries/index.js";

import {
	getTreeNodeSchemaPrivateData,
	StagedSchemaUpgradePolicy,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/core/index.js";
import {
	getSchemaIncompatibilityDetails,
	type ImplicitFieldSchema,
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
import { brand, oneFromIterable } from "../../util/index.js";
import { getStagedSchemaUpgrades, testSchema } from "../testTrees.js";
import { expectSchemaEqual } from "../utils.js";
import { createSchemaGraph, getObjectNodeSchema } from "./schemaTestUtils.js";

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

		/**
		 * Verifies that the candidate matches the expected schema, still allows all content permitted by the original stored schema,
		 * and lets the view read and edit documents that use the candidate schema.
		 *
		 * @param viewSchema - The view schema used to construct the proposed upgrade target.
		 * @param currentStoredSchema - The stored schema before the proposed upgrade.
		 * @param actualTarget - The generated stored-schema target to validate.
		 * @param expectedTarget - The expected stored schema after the upgrade, including retained fields and node definitions.
		 */
		function verifyUpgradeTarget(
			viewSchema: ImplicitFieldSchema,
			currentStoredSchema: TreeStoredSchema,
			actualTarget: TreeStoredSchema,
			expectedTarget: TreeStoredSchema,
		): void {
			// The target must contain exactly the expected schema, including retained fields and node definitions.
			expectSchemaEqual(actualTarget, expectedTarget);

			// The upgrade must still permit all content allowed by the original stored schema.
			assert(allowsRepoSuperset(defaultSchemaPolicy, currentStoredSchema, actualTarget));

			// The application must be able to read and write through its view after the target is applied.
			assert.equal(
				getSchemaIncompatibilityDetails(createTreeSchema(viewSchema), actualTarget),
				undefined,
			);
		}

		it("returns an equivalent target and no retained fields when the schemas match", () => {
			class Task extends schemaFactory.object("Task", { title: schemaFactory.string }) {}
			const viewSchema = createTreeSchema(Task);
			const storedSchema = toInitialSchema(Task);
			const result = getSchemaUpgradeCandidate(
				viewSchema,
				storedSchema,
				StagedSchemaUpgradePolicy.restrictive,
			);
			verifyUpgradeTarget(Task, storedSchema, result.schema, storedSchema);

			// Every stored field is declared by the view, so there are no unknown optional fields to retain.
			assert.deepEqual(result.retainedUnknownOptionalFields, []);
		});

		it("retains an omitted optional field and its metadata without replacing view metadata", () => {
			const estimatedHours = schemaFactory.optional(schemaFactory.number, {
				persistedMetadata: { unit: "hours" },
			});
			class Before extends schemaFactory.objectAlpha(
				"Task",
				{ title: schemaFactory.string, estimatedHours },
				{ persistedMetadata: { description: "Task with effort estimates" } },
			) {}

			// Remove `estimatedHours` and update the task description to reflect the retired estimation feature.
			class After extends schemaFactory.objectAlpha(
				"Task",
				{ title: schemaFactory.string },
				{ persistedMetadata: { description: "Task without effort estimates" } },
			) {}

			// Retain `estimatedHours` and its units, but use `After`'s current task description.
			class Expected extends schemaFactory.objectAlpha(
				"Task",
				{ title: schemaFactory.string, estimatedHours },
				{ persistedMetadata: { description: "Task without effort estimates" } },
			) {}
			const stored = toInitialSchema(Before);
			const result = getSchemaUpgradeCandidate(
				createTreeSchema(After),
				stored,
				StagedSchemaUpgradePolicy.restrictive,
			);

			verifyUpgradeTarget(After, stored, result.schema, toInitialSchema(Expected));
			assert.deepEqual(result.retainedUnknownOptionalFields, [
				{ nodeType: After.identifier, fieldKey: "estimatedHours" },
			]);

			const retained = getObjectNodeSchema(result.schema, After.identifier);
			assert.deepEqual(retained.getFieldSchema(brand("estimatedHours")).persistedMetadata, {
				unit: "hours",
			});
		});

		// Each version introduces a type the other view does not know.
		// The candidate must contain both fields and both complete node definitions.
		describe("mutually unknown node types", () => {
			class Reminder extends schemaFactory.objectAlpha(
				"Reminder",
				{ message: schemaFactory.string },
				{ persistedMetadata: { feature: "reminders" } },
			) {}
			class TaskWithReminder extends schemaFactory.object("Task", {
				reminder: schemaFactory.optional(Reminder),
			}) {}

			// Scheduling introduces a distinct node type, not a new definition of `Reminder`.
			class Schedule extends schemaFactory.object("Schedule", {
				durationMinutes: schemaFactory.number,
			}) {}

			// Replace `reminder?: Reminder` with `schedule?: Schedule` while keeping the stored `Task` identifier.
			class TaskWithSchedule extends schemaFactory.object("Task", {
				schedule: schemaFactory.optional(Schedule),
			}) {}

			// Either upgrade direction adds the view's field while retaining the other stored field.
			// The target therefore includes both `reminder` and `schedule`, along with both node types.
			class TaskWithBothFeatures extends schemaFactory.object("Task", {
				reminder: schemaFactory.optional(Reminder),
				schedule: schemaFactory.optional(Schedule),
			}) {}

			// Each row retains the original version's field and type while adding the other version's field.
			for (const [original, view, retainedKey] of [
				[TaskWithReminder, TaskWithSchedule, "reminder"],
				[TaskWithSchedule, TaskWithReminder, "schedule"],
			] as const) {
				it(`retains ${retainedKey} and its node type while adding the other field`, () => {
					const stored = toInitialSchema(original);
					const result = getSchemaUpgradeCandidate(
						createTreeSchema(view),
						stored,
						StagedSchemaUpgradePolicy.restrictive,
					);
					verifyUpgradeTarget(
						view,
						stored,
						result.schema,
						toInitialSchema(TaskWithBothFeatures),
					);
					assert.deepEqual(result.retainedUnknownOptionalFields, [
						{ nodeType: view.identifier, fieldKey: retainedKey },
					]);
				});
			}
		});

		it("retains recursive definitions reached through unknown map and array fields", () => {
			class ChecklistStep extends schemaFactory.objectRecursive("ChecklistStep", {
				instruction: schemaFactory.string,
				next: schemaFactory.optionalRecursive([() => ChecklistStep]),
			}) {}
			class Checklist extends schemaFactory.array("Checklist", ChecklistStep) {}
			class ChecklistsByCategory extends schemaFactory.map(
				"ChecklistsByCategory",
				Checklist,
			) {}
			class Before extends schemaFactory.object("Task", {
				checklists: schemaFactory.optional(ChecklistsByCategory),
			}) {}

			// Replace categorized checklists with effort estimates, removing all view references to the checklist types.
			class After extends schemaFactory.object("Task", {
				estimatedHours: schemaFactory.optional(schemaFactory.number),
			}) {}

			// Add `estimatedHours` while retaining `checklists` and all definitions needed to interpret them.
			class Expected extends schemaFactory.object("Task", {
				checklists: schemaFactory.optional(ChecklistsByCategory),
				estimatedHours: schemaFactory.optional(schemaFactory.number),
			}) {}
			const stored = toInitialSchema(Before);
			const result = getSchemaUpgradeCandidate(
				createTreeSchema(After),
				stored,
				StagedSchemaUpgradePolicy.restrictive,
			);

			// `After` declares none of `ChecklistsByCategory`, `Checklist`, or `ChecklistStep`.
			// Following the retained `checklists` field must include the map, array, and item definitions.
			// `ChecklistStep.next` refers back to `ChecklistStep`; that reference must not cause an endless loop.
			verifyUpgradeTarget(After, stored, result.schema, toInitialSchema(Expected));
			assert.deepEqual(result.retainedUnknownOptionalFields, [
				{ nodeType: After.identifier, fieldKey: "checklists" },
			]);
		});

		it("uses stored keys when deciding whether a field was removed", () => {
			class Before extends schemaFactory.object("Task", {
				notes: schemaFactory.optional(schemaFactory.string),
			}) {}

			// Rename the property `notes` to `comments`, keeping its stored key `notes` and optional string type.
			class After extends schemaFactory.object("Task", {
				comments: schemaFactory.optional(schemaFactory.string, { key: "notes" }),
			}) {}
			const stored = toInitialSchema(Before);
			const result = getSchemaUpgradeCandidate(
				createTreeSchema(After),
				stored,
				StagedSchemaUpgradePolicy.restrictive,
			);

			// `comments` still declares the stored field `notes`; this is a property rename, not field removal.
			verifyUpgradeTarget(After, stored, result.schema, stored);
			assert.deepEqual(result.retainedUnknownOptionalFields, []);
		});

		it("retains a stored key that matches the property name of another declared field", () => {
			class Before extends schemaFactory.object("Task", {
				completionPercent: schemaFactory.required(schemaFactory.number, { key: "progress" }),
				previousCompletionPercent: schemaFactory.optional(schemaFactory.number, {
					// This field is stored as `completionPercent`, while the property with that name is stored as `progress`.
					key: "completionPercent",
				}),
			}) {}

			// Remove `previousCompletionPercent` (stored key `completionPercent`), but keep the current progress field.
			class After extends schemaFactory.object("Task", {
				completionPercent: schemaFactory.required(schemaFactory.number, { key: "progress" }),
			}) {}
			const stored = toInitialSchema(Before);
			const result = getSchemaUpgradeCandidate(
				createTreeSchema(After),
				stored,
				StagedSchemaUpgradePolicy.restrictive,
			);

			// `After`'s property `completionPercent` uses stored key `progress`.
			// Stored key `completionPercent` is therefore still unknown despite matching a current property name.
			verifyUpgradeTarget(After, stored, result.schema, stored);
			assert.deepEqual(result.retainedUnknownOptionalFields, [
				{ nodeType: After.identifier, fieldKey: "completionPercent" },
			]);
		});

		it("reports each retained schema field once in a stable order", () => {
			class MemberBefore extends schemaFactory.object("Member", {
				workdayStartHour: schemaFactory.optional(schemaFactory.number),
				workdayEndHour: schemaFactory.optional(schemaFactory.number),
			}) {}
			class Before extends schemaFactory.object("Task", {
				assignee: MemberBefore,
				reviewer: MemberBefore,
				archiveReason: schemaFactory.optional(schemaFactory.string),
			}) {}

			// Retire work-hour tracking without changing the stored `Member` identifier.
			class MemberAfter extends schemaFactory.object("Member", {}) {}

			// Remove `archiveReason` and use `MemberAfter` for both `assignee` and `reviewer`.
			class After extends schemaFactory.object("Task", {
				assignee: MemberAfter,
				reviewer: MemberAfter,
			}) {}
			const stored = toInitialSchema(Before);
			const view = createTreeSchema(After);
			const result = getSchemaUpgradeCandidate(
				view,
				stored,
				StagedSchemaUpgradePolicy.restrictive,
			);
			verifyUpgradeTarget(After, stored, result.schema, stored);

			// Both `assignee` and `reviewer` use `Member`, but each retained `Member` field must appear only once.
			// Sort by node identifier and stored key, not by declaration or traversal order.
			assert.deepEqual(result.retainedUnknownOptionalFields, [
				{ nodeType: MemberAfter.identifier, fieldKey: "workdayEndHour" },
				{ nodeType: MemberAfter.identifier, fieldKey: "workdayStartHour" },
				{ nodeType: After.identifier, fieldKey: "archiveReason" },
			]);
		});

		it("does not retain an optional field when the view explicitly disables unknown fields", () => {
			class Before extends schemaFactory.object("Task", {
				estimatedHours: schemaFactory.optional(schemaFactory.number),
			}) {}

			// Remove `estimatedHours` and explicitly disable the unknown optional field support used by `Before`.
			class Strict extends schemaFactory.object(
				"Task",
				{},
				{ allowUnknownOptionalFields: false },
			) {}
			const stored = toInitialSchema(Before);
			const result = getSchemaUpgradeCandidate(
				createTreeSchema(Strict),
				stored,
				StagedSchemaUpgradePolicy.restrictive,
			);

			// Because `Strict` rejects unknown optional fields, the candidate must omit `estimatedHours`.
			// Removing the field disallows previously permitted content, so the upgrade check must reject the candidate.
			expectSchemaEqual(result.schema, toInitialSchema(Strict));
			assert.deepEqual(result.retainedUnknownOptionalFields, []);
			assert.equal(allowsRepoSuperset(defaultSchemaPolicy, stored, result.schema), false);
		});

		it("does not retain an omitted required field", () => {
			class Before extends schemaFactory.object("Task", { priority: schemaFactory.number }) {}

			// Remove the required `priority` field, leaving the view object empty.
			class After extends schemaFactory.object("Task", {}) {}
			const stored = toInitialSchema(Before);
			const result = getSchemaUpgradeCandidate(
				createTreeSchema(After),
				stored,
				StagedSchemaUpgradePolicy.restrictive,
			);

			// Only optional fields can be retained as unknown fields, so the candidate omits the required `priority` field.
			// It no longer permits tasks allowed by the original stored schema, so the upgrade check must reject it.
			expectSchemaEqual(result.schema, toInitialSchema(After));
			assert.deepEqual(result.retainedUnknownOptionalFields, []);
			assert.equal(allowsRepoSuperset(defaultSchemaPolicy, stored, result.schema), false);
		});

		it("uses a compatible current declaration of a staged-only referenced type", () => {
			class OldEstimate extends schemaFactory.object("EffortEstimate", {
				hours: schemaFactory.number,
			}) {}
			class Before extends schemaFactory.object("Task", {
				detailedEstimate: schemaFactory.optional(OldEstimate),
				estimate: schemaFactory.optional(schemaFactory.number),
			}) {}

			// Add an approval flag to `OldEstimate`, preserving its stored identifier and numeric `hours`.
			class NewEstimate extends schemaFactory.object("EffortEstimate", {
				hours: schemaFactory.number,
				isApproved: schemaFactory.optional(schemaFactory.boolean),
			}) {}

			// Remove `detailedEstimate`.
			// `estimate` still accepts numbers; it accepts `NewEstimate` only if the staged change is enabled.
			class After extends schemaFactory.object("Task", {
				estimate: schemaFactory.optional(
					schemaFactory.types([schemaFactory.number, schemaFactory.staged(NewEstimate)]),
				),
			}) {}

			// The retained `detailedEstimate` field still refers to `EffortEstimate`, so use the view's `NewEstimate` definition.
			// The staged change is disabled for `estimate`, so that field still accepts only numbers.
			class Expected extends schemaFactory.object("Task", {
				detailedEstimate: schemaFactory.optional(NewEstimate),
				estimate: schemaFactory.optional(schemaFactory.number),
			}) {}
			const view = createTreeSchema(After);
			const stored = toInitialSchema(Before);

			// With the staged change disabled, `estimate` accepts only numbers, so ordinary conversion omits `EffortEstimate`.
			// The complete view still includes `NewEstimate`, which declares that identifier.
			assert(view.definitions.has(NewEstimate.identifier));
			assert(!toInitialSchema(After).nodeSchema.has(brand(NewEstimate.identifier)));

			const result = getSchemaUpgradeCandidate(
				view,
				stored,
				StagedSchemaUpgradePolicy.restrictive,
			);
			verifyUpgradeTarget(After, stored, result.schema, toInitialSchema(Expected));
			assert.deepEqual(result.retainedUnknownOptionalFields, [
				{ nodeType: After.identifier, fieldKey: "detailedEstimate" },
			]);
		});

		it("uses an incompatible current declaration of a staged-only referenced type without hiding the conflict", () => {
			class OldEstimate extends schemaFactory.object("EffortEstimate", {
				hours: schemaFactory.number,
			}) {}

			// Change numeric `hours` to a string representation and add an approval flag, keeping the same stored identifier.
			class NewEstimate extends schemaFactory.object("EffortEstimate", {
				hours: schemaFactory.string,
				isApproved: schemaFactory.optional(schemaFactory.boolean),
			}) {}
			class Before extends schemaFactory.object("Task", {
				detailedEstimate: schemaFactory.optional(OldEstimate),
				estimate: schemaFactory.optional(schemaFactory.number),
			}) {}

			// Remove `detailedEstimate`.
			// Stage `NewEstimate`, with its incompatible `hours: string`, as another allowed type for `estimate`.
			class After extends schemaFactory.object("Task", {
				estimate: schemaFactory.optional(
					schemaFactory.types([schemaFactory.number, schemaFactory.staged(NewEstimate)]),
				),
			}) {}

			// Retain `detailedEstimate` using the view's `NewEstimate` declaration, while `estimate` still accepts only numbers.
			// This candidate is not a permitted upgrade: `NewEstimate` no longer allows the numeric `hours` values allowed by `OldEstimate`.
			class Expected extends schemaFactory.object("Task", {
				detailedEstimate: schemaFactory.optional(NewEstimate),
				estimate: schemaFactory.optional(schemaFactory.number),
			}) {}
			const view = createTreeSchema(After);
			const stored = toInitialSchema(Before);

			// Disabling the staged reference excludes `EffortEstimate` from ordinary conversion, not from the complete view.
			// When retained `detailedEstimate` needs this type, the builder must use `NewEstimate`, not the stored `OldEstimate`.
			assert(view.definitions.has(NewEstimate.identifier));
			assert(!toInitialSchema(After).nodeSchema.has(brand(NewEstimate.identifier)));

			const result = getSchemaUpgradeCandidate(
				view,
				stored,
				StagedSchemaUpgradePolicy.restrictive,
			);
			expectSchemaEqual(result.schema, toInitialSchema(Expected));
			assert.deepEqual(result.retainedUnknownOptionalFields, [
				{ nodeType: After.identifier, fieldKey: "detailedEstimate" },
			]);

			// The target requires `hours: string`, so it cannot safely replace stored `hours: number`.
			assert.equal(allowsRepoSuperset(defaultSchemaPolicy, stored, result.schema), false);

			// The candidate is compatible with the view, but is not a permitted upgrade of the original stored schema.
			assert.equal(getSchemaIncompatibilityDetails(view, result.schema), undefined);
		});

		for (const enabled of [false, true]) {
			it(`applies the supplied staged policy while retaining unknown fields (${enabled ? "enabled" : "disabled"})`, () => {
				class Before extends schemaFactory.object("Task", {
					isArchived: schemaFactory.optional(schemaFactory.boolean),
					estimatedHours: schemaFactory.number,
					priority: schemaFactory.number,
				}) {}

				// Remove `isArchived`.
				// Stage two changes: allow `estimatedHours` to be absent and allow `priority` to contain strings as well as numbers.
				class After extends schemaFactory.object("Task", {
					estimatedHours: schemaFactory.stagedOptional(schemaFactory.number),
					priority: schemaFactory.types([
						schemaFactory.number,
						schemaFactory.staged(schemaFactory.string),
					]),
				}) {}

				// Always retain `isArchived`. Only the selected policy can make `estimatedHours` optional or allow `string` priorities.
				// With staging disabled, both declared fields keep their original required numeric constraints.
				class Expected extends schemaFactory.object("Task", {
					isArchived: schemaFactory.optional(schemaFactory.boolean),
					estimatedHours: enabled
						? schemaFactory.optional(schemaFactory.number)
						: schemaFactory.required(schemaFactory.number),
					priority: enabled
						? [schemaFactory.number, schemaFactory.string]
						: schemaFactory.number,
				}) {}
				const policy = enabled
					? StagedSchemaUpgradePolicy.permissive
					: StagedSchemaUpgradePolicy.restrictive;
				const stored = toInitialSchema(Before);
				const result = getSchemaUpgradeCandidate(createTreeSchema(After), stored, policy);

				// Retaining `isArchived` must not enable or disable the other schema changes.
				// The target must still reflect the supplied staging policy.
				verifyUpgradeTarget(After, stored, result.schema, toInitialSchema(Expected));
				assert.deepEqual(result.retainedUnknownOptionalFields, [
					{ nodeType: After.identifier, fieldKey: "isArchived" },
				]);
			});
		}

		it("preserves root constraints instead of hiding an incompatible root change", () => {
			class Before extends schemaFactory.object("Task", {
				notes: schemaFactory.optional(schemaFactory.string),
			}) {}

			const stored = toInitialSchema(schemaFactory.optional(Before));

			// Remove `notes` from the view.
			class After extends schemaFactory.object("Task", {}) {}

			// Using `After` directly as the root makes the previously optional root required.
			const view = createTreeSchema(After);

			const result = getSchemaUpgradeCandidate(
				view,
				stored,
				StagedSchemaUpgradePolicy.restrictive,
			);

			// The stored schema permits an empty root; `After` requires a `Task` object.
			// Retaining `Task.notes` must not make the candidate's root optional to avoid rejecting the upgrade.
			assert.deepEqual(result.schema.rootFieldSchema, toInitialSchema(After).rootFieldSchema);
			assert.deepEqual(result.retainedUnknownOptionalFields, [
				{ nodeType: After.identifier, fieldKey: "notes" },
			]);
			assert.equal(allowsRepoSuperset(defaultSchemaPolicy, stored, result.schema), false);
		});

		/**
		 * 1. Declare optional `assignment` with an empty set of allowed types.
		 * 2. Remove `assignment` from the view.
		 * The upgrade target must retain the stored field declaration even though it cannot contain a value.
		 */
		it("retains an optional field with no allowed types", () => {
			class Before extends schemaFactory.object("Task", {
				assignment: schemaFactory.optional([]), // No value is permitted.
			}) {}

			// Remove `assignment` from the view without changing the stored `Task` identifier.
			class After extends schemaFactory.object("Task", {}) {}
			const stored = toInitialSchema(Before);
			const result = getSchemaUpgradeCandidate(
				createTreeSchema(After),
				stored,
				StagedSchemaUpgradePolicy.restrictive,
			);

			// The expected target is the original stored schema: `assignment` remains declared even though no value can be stored in it.
			verifyUpgradeTarget(After, stored, result.schema, stored);
			assert.deepEqual(result.retainedUnknownOptionalFields, [
				{ nodeType: After.identifier, fieldKey: "assignment" },
			]);
		});
	});
});
