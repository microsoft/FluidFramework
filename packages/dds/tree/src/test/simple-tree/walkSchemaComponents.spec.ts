/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { currentVersion } from "../../codec/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Tests the persisted schema format.
import { schemaCodecBuilder } from "../../feature-libraries/schema-index/codec.js";
import {
	getTreeNodeSchemaPrivateData,
	StagedSchemaUpgradePolicy,
	walkAllowedTypes,
	type AllowedTypesFullEvaluated,
	type TreeNodeSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { walkSchemaComponents } from "../../simple-tree/core/walkSchemaComponents.js";
// eslint-disable-next-line import-x/no-internal-modules
import { getUnhydratedContext } from "../../simple-tree/createContext.js";
import {
	encodeSchemaCompatibilitySnapshot,
	computeSchemaHash,
	normalizeFieldSchema,
	SchemaFactoryAlpha,
	TreeViewConfigurationAlpha,
} from "../../simple-tree/index.js";
import {
	simpleStoredSchemaToStoredSchema,
	toStoredSchema,
	transformSimpleSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/toStoredSchema.js";
import {
	createTreeSchema,
	getSchemaDerivedData,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/treeSchema.js";

function graph(edges: readonly (readonly number[])[]): TreeNodeSchema[] {
	const sf = new SchemaFactoryAlpha("components");
	const nodes: TreeNodeSchema[] = [];
	for (const [index, children] of edges.entries()) {
		nodes.push(
			class extends sf.objectRecursive(`N${index}`, {
				child: sf.optionalRecursive(
					children.map((child) => () => nodes[child] ?? assert.fail()),
				),
			}) {},
		);
	}
	return nodes;
}

describe("walkSchemaComponents", () => {
	it("visits cached and uncached fields in the same order as the ordinary walk", () => {
		const [a, b, c, d] = graph([[1, 2, 1], [0], [3], []]);
		assert(a !== undefined && b !== undefined && c !== undefined && d !== undefined);
		const root = normalizeFieldSchema(a);
		const expected: AllowedTypesFullEvaluated[] = [];
		walkAllowedTypes(root.allowedTypesFull.evaluate(), {
			allowedTypes: (types) => expected.push(types),
		});
		// The component walker visits node fields, not the root field itself.
		expected.pop();
		for (const cachedRoot of [undefined, c, a]) {
			if (cachedRoot !== undefined) {
				getSchemaDerivedData(cachedRoot);
			}
			const actual: AllowedTypesFullEvaluated[] = [];
			walkSchemaComponents(
				[a],
				() => {},
				(schema) => getTreeNodeSchemaPrivateData(schema).component !== undefined,
				(types) => actual.push(types),
			);
			assert.deepEqual(actual, expected);
		}
	});

	for (const [name, edges, expected] of [
		["single", [[]], [[0]]],
		["self-cycle", [[0]], [[0]]],
		["cycle", [[1], [2], [0]], [[0, 1, 2]]],
		["chain", [[1], [2], []], [[2], [1], [0]]],
		["diamond", [[1, 2], [3], [3], []], [[3], [1], [2], [0]]],
		[
			"multiple components",
			[[1], [0, 2], [3], [2]],
			[
				[2, 3],
				[0, 1],
			],
		],
		["disconnected", [[], []], [[0], [1]]],
	] as const) {
		it(`completes ${name} in dependency order`, () => {
			const nodes = graph(edges);
			const completed = new Set<TreeNodeSchema>();
			const components: number[][] = [];
			walkSchemaComponents(nodes, (members) => {
				const identities = new Set(members.map((member) => member.schema));
				for (const { fields } of members) {
					for (const field of fields) {
						for (const type of field.types) {
							assert(identities.has(type.type) || completed.has(type.type));
						}
					}
				}
				components.push(
					members.map((member) => nodes.indexOf(member.schema)).sort((a, b) => a - b),
				);
				for (const member of identities) {
					assert(!completed.has(member));
					completed.add(member);
				}
			});
			assert.deepEqual(components, expected);
		});
	}

	it("includes leaf identities and skips completed dependencies", () => {
		const sf = new SchemaFactoryAlpha("leafComponents");
		class Parent extends sf.array("Parent", sf.number) {}
		const completed = new Set<TreeNodeSchema>();
		const visits: TreeNodeSchema[] = [];
		for (const root of [sf.number, Parent, Parent]) {
			walkSchemaComponents(
				[root],
				(members) => {
					for (const { schema } of members) {
						visits.push(schema);
						completed.add(schema);
					}
				},
				(schema) => completed.has(schema),
			);
		}
		assert.deepEqual(visits, [sf.number, Parent]);
	});

	for (const cycle of [false, true]) {
		it(`handles a deep ${cycle ? "cycle" : "chain"} including lazy evaluation`, () => {
			const depth = 5000;
			const nodes = graph(
				Array.from({ length: depth }, (_, i) => (i + 1 < depth ? [i + 1] : cycle ? [0] : [])),
			);
			const root = nodes[0] ?? assert.fail();
			const data = getSchemaDerivedData(root);
			assert.equal(data.treeSchema.definitions.size, depth);
			assert.equal(data.hasStagedSchema, false);
			assert.equal(
				getTreeNodeSchemaPrivateData(root).component?.members.length,
				cycle ? depth : 1,
			);
			assert.strictEqual(
				new TreeViewConfigurationAlpha({ schema: root }).definitions,
				data.treeSchema.definitions,
			);
		});
	}
});

describe("component-derived schema state", () => {
	for (const first of [0, 1, 2]) {
		it(`shares maps with stable serialization when queried from ${first} first`, () => {
			const [a, b, parent] = graph([[1], [0], [1]]);
			assert(a !== undefined && b !== undefined && parent !== undefined);
			getSchemaDerivedData([a, b, parent][first] ?? assert.fail());
			const aData = getSchemaDerivedData(a);
			const bData = getSchemaDerivedData(b);
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
			// Captured with the same schema identities and structure at pre-refactor commit 1099dc048df.
			assert.equal(computeSchemaHash(a), "0aec93b1d34f96c13c2a92a5e494939e");
			assert.equal(computeSchemaHash(b), "0458eb955807e91b2f7e1db31fa60da6");
			const codec = schemaCodecBuilder.build({
				jsonValidator: FormatValidatorBasic,
				minVersionForCollab: currentVersion,
			});
			for (const root of [a, b]) {
				const baseline = createTreeSchema(root);
				assert.equal(
					JSON.stringify(
						encodeSchemaCompatibilitySnapshot(getSchemaDerivedData(root).treeSchema),
					),
					JSON.stringify(encodeSchemaCompatibilitySnapshot(baseline)),
				);
				for (const policy of [
					StagedSchemaUpgradePolicy.restrictive,
					StagedSchemaUpgradePolicy.permissive,
				]) {
					const expected = simpleStoredSchemaToStoredSchema(
						transformSimpleSchema(baseline, policy),
					);
					assert.deepEqual(toStoredSchema(root, policy), expected);
					assert.equal(
						JSON.stringify(codec.encode(toStoredSchema(root, policy))),
						JSON.stringify(codec.encode(expected)),
					);
				}
			}
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
	}

	it("materializes only requested closures, including overlapping unions and empty roots", () => {
		const [a, b, c, d] = graph([[1, 2], [3], [3], []]);
		assert(a !== undefined && b !== undefined && c !== undefined && d !== undefined);
		const data = getSchemaDerivedData(a);
		assert.equal(data.treeSchema.definitions.size, 4);
		for (const node of [b, c, d]) {
			const component = getTreeNodeSchemaPrivateData(node).component ?? assert.fail();
			assert.equal(component.definitions, undefined);
		}
		assert.equal(getSchemaDerivedData([b, c]).treeSchema.definitions.size, 3);
		assert.equal(getTreeNodeSchemaPrivateData(d).component?.definitions, undefined);
		const empty = getSchemaDerivedData([]);
		assert.equal(empty.treeSchema.definitions.size, 0);
		assert.equal(empty.hasStagedSchema, false);
	});

	it("keeps policy-specific topology separate when a staged edge splits a component", () => {
		const sf = new SchemaFactoryAlpha("split");
		class A extends sf.objectRecursive("A", {
			child: sf.optionalRecursive([() => B]),
		}) {}
		class B extends sf.objectRecursive("B", {
			child: sf.optionalRecursive(sf.types([sf.staged(() => A)])),
		}) {}
		const a = getSchemaDerivedData(A);
		const b = getSchemaDerivedData(B);
		assert.strictEqual(a.treeSchema.definitions, b.treeSchema.definitions);
		assert.equal(toStoredSchema(A, StagedSchemaUpgradePolicy.restrictive).nodeSchema.size, 2);
		assert.equal(toStoredSchema(B, StagedSchemaUpgradePolicy.restrictive).nodeSchema.size, 1);
		assert.equal(toStoredSchema(B, StagedSchemaUpgradePolicy.permissive).nodeSchema.size, 2);
		assert.strictEqual(
			toStoredSchema(A, StagedSchemaUpgradePolicy.permissive).nodeSchema,
			toStoredSchema(B, StagedSchemaUpgradePolicy.permissive).nodeSchema,
		);
		const customPermissive = { ...StagedSchemaUpgradePolicy.permissive };
		assert.notStrictEqual(
			toStoredSchema(A, customPermissive).nodeSchema,
			toStoredSchema(B, customPermissive).nodeSchema,
		);
	});

	it("reuses permissive conversion while preserving root field kind and metadata", () => {
		const sf = new SchemaFactoryAlpha("storedComponents");
		class A extends sf.objectRecursive("A", {
			child: sf.optionalRecursive([() => B]),
		}) {}
		class B extends sf.objectRecursive("B", {
			child: sf.optionalRecursive([() => A]),
		}) {}
		getSchemaDerivedData(A);
		let reads = 0;
		for (const node of [A, B]) {
			const fields = node.fields;
			Object.defineProperty(node, "fields", {
				get() {
					reads++;
					return fields;
				},
			});
		}
		const a = toStoredSchema(A, StagedSchemaUpgradePolicy.permissive);
		assert.equal(reads, 2);
		const b = toStoredSchema(B, StagedSchemaUpgradePolicy.permissive);
		const optional = sf.optional(A, { persistedMetadata: { description: "optional" } });
		const field = toStoredSchema(optional, StagedSchemaUpgradePolicy.permissive);
		assert.equal(reads, 2);
		assert.strictEqual(a.nodeSchema, b.nodeSchema);
		assert.strictEqual(a.nodeSchema, field.nodeSchema);
		assert.notDeepEqual(a.rootFieldSchema, b.rootFieldSchema);
		assert.notEqual(a.rootFieldSchema.kind, field.rootFieldSchema.kind);
		assert.deepEqual(field.rootFieldSchema.persistedMetadata, { description: "optional" });
	});

	it("does not publish partial permissive conversions or contexts after an error", () => {
		const [a, b] = graph([[1], [0]]);
		assert(a !== undefined && b !== undefined);
		const data = getSchemaDerivedData(a);
		const component = data.component ?? assert.fail();
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
			assert.equal(component.permissiveStoredDefinitions, undefined);
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

	it("retains annotations and duplicate entries when topology references repeat", () => {
		const sf = new SchemaFactoryAlpha("repeatedReferences");
		class Root extends sf.objectAlpha("Root", {
			value: sf.types([sf.number, sf.staged(sf.number)]),
			other: sf.number,
		}) {}
		let visits = 0;
		walkSchemaComponents([Root], (members) => {
			for (const member of members) {
				visits++;
				if (member.schema === Root) {
					assert.deepEqual(
						member.fields.map((field) => field.types.length),
						[2, 1],
					);
				}
			}
		});
		assert.equal(visits, 2);
		assert.equal(getSchemaDerivedData(Root).hasStagedSchema, true);
		assert.throws(
			() => new TreeViewConfigurationAlpha({ schema: Root }),
			validateUsageError(/Duplicate schema in allowed types/),
		);
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
			assert.throws(() => getSchemaDerivedData(Parent), i === 0 ? /lazy failure/ : TypeError);
			assert.equal(getTreeNodeSchemaPrivateData(Parent).component, undefined);
			assert.equal(getTreeNodeSchemaPrivateData(Bad).component, undefined);
			assert.notEqual(getTreeNodeSchemaPrivateData(Good).component, undefined);
			assert.equal(getTreeNodeSchemaPrivateData(Good).component?.definitions, undefined);
		}
		assert.equal(getSchemaDerivedData(Good).treeSchema.definitions.size, 1);
		assert.equal(getUnhydratedContext(Good).schema.size, 1);
	});

	it("rechecks identifier conflicts when combining cached components", () => {
		const sf = new SchemaFactoryAlpha("conflicts");
		class A extends sf.object("Duplicate", {}) {}
		class B extends sf.object("Duplicate", {}) {}
		for (const node of [A, B]) {
			getUnhydratedContext(node);
		}
		class Parent extends sf.object("Parent", { a: A, b: B }) {}
		for (let i = 0; i < 2; i++) {
			for (const request of [
				() => getSchemaDerivedData(Parent),
				() => getUnhydratedContext(Parent),
				() => new TreeViewConfigurationAlpha({ schema: Parent }),
			]) {
				assert.throws(request, validateUsageError(/Multiple schema encountered/));
			}
			assert.equal(getTreeNodeSchemaPrivateData(Parent).component?.definitions, undefined);
		}
		assert.equal(getUnhydratedContext(A).schema.size, 1);
		assert.equal(getUnhydratedContext(B).schema.size, 1);
	});

	it("does not bypass most-derived validation after analysis", () => {
		const sf = new SchemaFactoryAlpha("mostDerived");
		const Base = sf.object("Base", {});
		class A extends Base {}
		class B extends Base {}
		getSchemaDerivedData(A);
		assert.throws(
			() => getSchemaDerivedData(B),
			validateUsageError(/Two schema classes were used/),
		);
	});
});
