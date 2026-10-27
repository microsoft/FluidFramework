/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	validateAssertionError,
	validateUsageError,
} from "@fluidframework/test-runtime-utils/internal";

import { currentVersion } from "../../codec/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Tests the persisted schema format.
import { schemaCodecBuilder } from "../../feature-libraries/schema-index/codec.js";
import {
	getTreeNodeSchemaPrivateData,
	StagedSchemaUpgradePolicy,
	walkAllowedTypes,
	walkSchema,
	walkNodeSchema,
	type AllowedTypesFullEvaluated,
	type IncrementalSchemaVisitor,
	type SchemaVisitor,
	type TreeNodeSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/core/index.js";
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
// eslint-disable-next-line import-x/no-internal-modules -- Exercise the field-root visitor entry point.
import { walkFieldSchema } from "../../simple-tree/walkFieldSchema.js";
import type { isAssignableTo, requireFalse, requireTrue } from "../../util/index.js";

type _incrementalIsNotOrdinary = requireFalse<
	isAssignableTo<IncrementalSchemaVisitor, SchemaVisitor>
>;

/**
 * Creates fresh schema identities from adjacency lists, with lazy references supporting forward edges and cycles.
 * `edges[i]` lists the indices of schemas referenced by returned schema `i`.
 */
function createSchemaGraph(edges: readonly (readonly number[])[]): TreeNodeSchema[] {
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

describe("component-derived schema state", () => {
	for (const first of [0, 1, 2]) {
		it(`shares maps with stable serialization when queried from ${first} first`, () => {
			const [a, b, parent] = createSchemaGraph([[1], [0], [1]]);
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
			// Captured from schemas with these identifiers and structure at pre-refactor commit 1099dc048df.
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
		const [a, b, c, d] = createSchemaGraph([[1, 2], [3], [3], []]);
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

	it("deduplicates dependencies on different members of the same component", () => {
		const [root, a, b] = createSchemaGraph([[1, 2, 1], [2], [1]]);
		assert(root !== undefined && a !== undefined && b !== undefined);
		getSchemaDerivedData(root);
		const rootComponent = getTreeNodeSchemaPrivateData(root).component ?? assert.fail();
		const dependency = getTreeNodeSchemaPrivateData(a).component ?? assert.fail();
		assert.strictEqual(dependency, getTreeNodeSchemaPrivateData(b).component);
		assert.deepEqual(rootComponent.members, [root]);
		assert.deepEqual(new Set(dependency.members), new Set([a, b]));
		assert.deepEqual(rootComponent.dependencies, new Set([dependency]));
		assert.equal(dependency.dependencies.size, 0);
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
		assert.strictEqual(
			toStoredSchema(A, customPermissive).nodeSchema,
			toStoredSchema(B, customPermissive).nodeSchema,
		);
		const visited: TreeNodeSchema[] = [];
		walkAllowedTypes(normalizeFieldSchema(B).allowedTypesFull.evaluate(), {
			allowedTypeFilter: (type) => type.metadata.stagedSchemaUpgrade === undefined,
			node: (schema) => visited.push(schema),
		});
		assert.deepEqual(visited, [B]);
		assert.strictEqual(
			getTreeNodeSchemaPrivateData(A).component,
			getTreeNodeSchemaPrivateData(B).component,
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
		const [a, b] = createSchemaGraph([[1], [0]]);
		assert(a !== undefined && b !== undefined);
		const data = getSchemaDerivedData(a);
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

	it("retains annotations and duplicate entries when topology references repeat", () => {
		const sf = new SchemaFactoryAlpha("repeatedReferences");
		class Root extends sf.objectAlpha("Root", {
			value: sf.types([sf.number, sf.staged(sf.number)]),
			other: sf.number,
		}) {}
		let visits = 0;
		walkFieldSchema(Root, {
			stronglyConnectedComponent: (members) => {
				for (const member of members) {
					visits++;
					if (member === Root) {
						assert.deepEqual(
							getTreeNodeSchemaPrivateData(member).childAllowedTypes.map(
								(field) => field.evaluate().types.length,
							),
							[2, 1],
						);
					}
				}
			},
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

	for (const cycle of [false, true]) {
		it(`analyzes a deep ${cycle ? "cycle" : "chain"} including lazy evaluation`, () => {
			const depth = 5000;
			const nodes = createSchemaGraph(
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

// Tests component and incremental traversal; ordinary traversal coverage is in walkSchema.spec.ts.
describe("schema component visitor", () => {
	it("filters references before querying previous component visits", () => {
		const sf = new SchemaFactoryAlpha("filterBeforePreviousVisit");
		class Parent extends sf.array("Parent", [sf.number, sf.string]) {}
		const components: (readonly TreeNodeSchema[])[] = [];
		walkSchema([Parent], {
			allowedTypeFilter: ({ type }) => type !== sf.string,
			wasComponentVisited: (schema) => {
				assert.notStrictEqual(schema, sf.string);
				return schema === sf.number;
			},
			stronglyConnectedComponent: (members) => components.push(members),
		});
		assert.deepEqual(components, [[Parent]]);
	});

	// Test pruning and field-reporting modes to ensure both reuse completed components.
	for (const observeFields of [false, true]) {
		// Include and exclude the staged back-edge to test reuse with cyclic and acyclic filtered graphs.
		for (const includeStaged of [false, true]) {
			it(`reuses completed components within a filtered graph (fields: ${observeFields}, staged: ${includeStaged})`, () => {
				const sf = new SchemaFactoryAlpha("incrementalFiltering");
				class A extends sf.objectRecursive("A", {
					child: sf.optionalRecursive([() => B]),
				}) {}
				class B extends sf.objectRecursive("B", {
					child: sf.optionalRecursive(sf.types([sf.staged(() => A)])),
				}) {}
				const completed = new Set<TreeNodeSchema>();
				const components: (readonly TreeNodeSchema[])[] = [];
				const fields: AllowedTypesFullEvaluated[] = [];
				const visitor: IncrementalSchemaVisitor = {
					allowedTypeFilter: (type) =>
						includeStaged || type.metadata.stagedSchemaUpgrade === undefined,
					wasComponentVisited: (schema) => completed.has(schema),
					allowedTypes: observeFields ? (types) => fields.push(types) : undefined,
					stronglyConnectedComponent: (members) => {
						components.push(members);
						for (const member of members) {
							completed.add(member);
						}
					},
				};
				walkSchema([B], visitor);
				assert.deepEqual(
					components.map((members) => new Set(members)),
					includeStaged ? [new Set([A, B])] : [new Set([B])],
				);
				walkSchema([A], visitor);
				assert.deepEqual(
					components.map((members) => new Set(members)),
					includeStaged ? [new Set([A, B])] : [new Set([B]), new Set([A])],
				);
				components.length = 0;
				fields.length = 0;
				walkSchema([A], visitor);
				assert.deepEqual(components, []);
				assert.equal(fields.length, observeFields ? 2 : 0);
			});
		}
	}

	it("validates incremental visitor requirements in types and at runtime", () => {
		const incremental: IncrementalSchemaVisitor = {
			wasComponentVisited: () => false,
			stronglyConnectedComponent: () => {},
		};
		walkSchema([], incremental);
		const missingCallback = { wasComponentVisited: () => false };
		const withNode = { ...incremental, node: () => {} };
		const withFilter = { ...incremental, allowedTypeFilter: () => true };
		type _missingComponentCallback = requireFalse<
			isAssignableTo<typeof missingCallback, Parameters<typeof walkSchema>[1]>
		>;
		type _nodeCallbackExcluded = requireFalse<
			isAssignableTo<typeof withNode, Parameters<typeof walkSchema>[1]>
		>;
		type _filterAllowed = requireTrue<
			isAssignableTo<typeof withFilter, Parameters<typeof walkSchema>[1]>
		>;
		walkSchema([], withFilter);
		// Reject both missing component callbacks and incompatible node callbacks, even through variables.
		for (const visitor of [missingCallback, withNode]) {
			assert.throws(
				// @ts-expect-error Invalid combinations are rejected even through variables.
				() => walkSchema([], visitor),
				validateAssertionError(/Incremental component visits require/),
			);
		}
	});

	it("does not require the caller to record component visits during this walk", () => {
		const [a, b, c] = createSchemaGraph([[1, 1, 2], [0, 2], []]);
		assert(a !== undefined && b !== undefined && c !== undefined);
		const earlierVisits = new Set([c]);
		// Test both traversal modes to ensure cycle detection does not depend on updating the caller's results.
		for (const observeFields of [false, true]) {
			const components: (readonly TreeNodeSchema[])[] = [];
			let fieldCallbackCount = 0;
			const visitor: IncrementalSchemaVisitor = {
				wasComponentVisited: (schema) => earlierVisits.has(schema),
				stronglyConnectedComponent: (members) => components.push(members),
				allowedTypes: observeFields ? () => fieldCallbackCount++ : undefined,
			};
			walkSchema([a, b, c], visitor);
			assert.deepEqual(
				components.map((members) => new Set(members)),
				[new Set([a, b])],
			);
			assert.equal(fieldCallbackCount, observeFields ? 3 : 0);
			assert.deepEqual(earlierVisits, new Set([c]));
		}
	});

	it("uses schema identity rather than identifiers", () => {
		const sf = new SchemaFactoryAlpha("componentIdentity");
		class A extends sf.object("Duplicate", {}) {}
		class B extends sf.object("Duplicate", {}) {}
		const components: (readonly TreeNodeSchema[])[] = [];
		walkFieldSchema([A, B, A], {
			stronglyConnectedComponent: (members) => components.push(members),
		});
		assert.deepEqual(components, [[A], [B]]);
	});

	it("does not report unfinished components after a visitor throws", () => {
		const [a, b, leaf] = createSchemaGraph([[2, 1], [0], []]);
		assert(a !== undefined && b !== undefined && leaf !== undefined);
		const components: (readonly TreeNodeSchema[])[] = [];
		const error = new Error("node visitor failed");
		assert.throws(
			() =>
				walkFieldSchema(a, {
					node: (schema) => {
						if (schema === b) {
							throw error;
						}
					},
					stronglyConnectedComponent: (members) => components.push(members),
				}),
			(thrown: unknown) => thrown === error,
		);
		assert.deepEqual(components, [[leaf]]);
		const retry: (readonly TreeNodeSchema[])[] = [];
		walkFieldSchema(a, {
			stronglyConnectedComponent: (members) => retry.push(members),
		});
		assert.deepEqual(
			retry.map((members) => new Set(members)),
			[new Set([leaf]), new Set([a, b])],
		);
	});

	it("retries a failed component callback without repeating successfully completed dependencies", () => {
		const [a, b, leaf] = createSchemaGraph([[2, 1], [0], []]);
		assert(a !== undefined && b !== undefined && leaf !== undefined);
		const completed = new Set<TreeNodeSchema>();
		const componentAttempts: (readonly TreeNodeSchema[])[] = [];
		const error = new Error("component visitor failed");
		let shouldFailComponent = true;
		const visitor: IncrementalSchemaVisitor = {
			wasComponentVisited: (schema) => completed.has(schema),
			stronglyConnectedComponent: (members) => {
				componentAttempts.push(members);
				if (shouldFailComponent && members.includes(a)) {
					throw error;
				}
				// Record completion only after successful processing so a failed component can be retried.
				for (const member of members) {
					completed.add(member);
				}
			},
		};
		assert.throws(
			() => walkSchema([a], visitor),
			(thrown: unknown) => thrown === error,
		);
		assert.deepEqual(
			componentAttempts.map((members) => new Set(members)),
			[new Set([leaf]), new Set([a, b])],
		);
		assert.deepEqual(completed, new Set([leaf]));

		shouldFailComponent = false;
		componentAttempts.length = 0;
		walkSchema([a], visitor);
		assert.deepEqual(
			componentAttempts.map((members) => new Set(members)),
			[new Set([a, b])],
		);
		assert.deepEqual(completed, new Set([a, b, leaf]));
	});

	it("reports components on every ordinary walk and respects filtered topology", () => {
		const sf = new SchemaFactoryAlpha("componentNotifications");
		class A extends sf.objectRecursive("A", {
			child: sf.optionalRecursive([() => B]),
			leaf: sf.number,
		}) {}
		class B extends sf.objectRecursive("B", {
			child: sf.optionalRecursive(sf.types([sf.staged(() => A)])),
		}) {}
		// Change the topology and then restore it to ensure ordinary walks retain no component results.
		for (const filtered of [false, true, false]) {
			const components: (readonly TreeNodeSchema[])[] = [];
			walkFieldSchema(B, {
				allowedTypeFilter: (type) =>
					!filtered || type.metadata.stagedSchemaUpgrade === undefined,
				stronglyConnectedComponent: (members) => components.push(members),
			});
			assert.deepEqual(
				components.map((members) => new Set(members)),
				filtered ? [new Set([B])] : [new Set([sf.number]), new Set([A, B])],
			);
		}
	});

	it("preserves node and field event order when component callbacks are enabled", () => {
		const [a, b, c] = createSchemaGraph([[1], [0, 2], []]);
		assert(a !== undefined && b !== undefined && c !== undefined);
		const ordinary: (TreeNodeSchema | AllowedTypesFullEvaluated)[] = [];
		const withComponents: typeof ordinary = [];
		walkNodeSchema(a, {
			node: (schema) => ordinary.push(schema),
			allowedTypes: (types) => ordinary.push(types),
		});
		walkNodeSchema(a, {
			node: (schema) => withComponents.push(schema),
			allowedTypes: (types) => withComponents.push(types),
			stronglyConnectedComponent: (members) => {
				assert(members.every((member) => withComponents.includes(member)));
			},
		});
		assert.deepEqual(withComponents, ordinary);
	});

	it("visits complete cycles independently on each walk", () => {
		const [a, b] = createSchemaGraph([[1], [0]]);
		assert(a !== undefined && b !== undefined);
		let calls = 0;
		// Repeat the same node-root walk to ensure discovery state is local to each call.
		for (let i = 0; i < 2; i++) {
			walkNodeSchema(a, {
				stronglyConnectedComponent: (members) => {
					calls++;
					assert.deepEqual(new Set(members), new Set([a, b]));
				},
			});
		}
		assert.equal(calls, 2);
	});

	it("does not report components for empty roots", () => {
		walkFieldSchema([], {
			stronglyConnectedComponent: () => assert.fail("Empty roots have no components"),
		});
	});

	it("does not filter an explicit node root or report a synthetic root allowed-type list", () => {
		const [root, child] = createSchemaGraph([[1], []]);
		assert(root !== undefined && child !== undefined);
		const components: (readonly TreeNodeSchema[])[] = [];
		const fields: AllowedTypesFullEvaluated[] = [];
		walkNodeSchema(root, {
			allowedTypeFilter: () => false,
			allowedTypes: (types) => fields.push(types),
			stronglyConnectedComponent: (members) => components.push(members),
		});
		assert.deepEqual(components, [[root]]);
		assert.deepEqual(
			fields,
			getTreeNodeSchemaPrivateData(root).childAllowedTypes.map((field) => field.evaluate()),
		);
	});

	it("does not evaluate completed components' fields when field callbacks are absent", () => {
		const sf = new SchemaFactoryAlpha("prunedFields");
		class Cached extends sf.objectRecursive("Cached", {
			child: sf.optionalRecursive([
				() => assert.fail("Completed components must not evaluate their fields"),
			]),
		}) {}
		class Parent extends sf.object("Parent", { first: Cached, second: Cached }) {}
		const components: (readonly TreeNodeSchema[])[] = [];
		const visitor: IncrementalSchemaVisitor = {
			wasComponentVisited: (schema) => schema === Cached,
			stronglyConnectedComponent: (members) => components.push(members),
		};
		walkSchema([Parent], visitor);
		walkSchema([Cached], visitor);
		assert.deepEqual(components, [[Parent]]);
	});

	it("reports complete annotations for each field despite filtering and completed dependencies", () => {
		const sf = new SchemaFactoryAlpha("fieldAnnotations");
		const types = sf.types([sf.number, sf.staged(sf.number), sf.string]);
		class Parent extends sf.objectAlpha("Parent", { first: types, second: types }) {}
		const fields: AllowedTypesFullEvaluated[] = [];
		const components: (readonly TreeNodeSchema[])[] = [];
		walkSchema([Parent], {
			allowedTypeFilter: ({ type }) => type !== sf.string,
			wasComponentVisited: (schema) => schema === sf.number,
			allowedTypes: (field) => fields.push(field),
			stronglyConnectedComponent: (members) => components.push(members),
		});
		assert.deepEqual(components, [[Parent]]);
		assert.deepEqual(fields, [types.evaluate(), types.evaluate()]);
	});

	it("validates most-derived identity before querying previous visits when field callbacks are enabled", () => {
		const sf = new SchemaFactoryAlpha("validationBeforeCache");
		const Base = sf.object("Base", {});
		class Used extends Base {}
		class Invalid extends Base {}
		walkSchema([Used], {});
		let queries = 0;
		assert.throws(
			() =>
				walkSchema([Invalid], {
					stronglyConnectedComponent: () => {},
					allowedTypes: () => {},
					wasComponentVisited: () => {
						queries++;
						throw new Error("Previous visit queried before schema validation");
					},
				}),
			validateUsageError(/Two schema classes were used/),
		);
		assert.equal(queries, 0);
	});

	it("visits cached and uncached fields in the same order as the ordinary walk", () => {
		const [a, , c] = createSchemaGraph([[1, 2, 1], [0], [3], []]);
		assert(a !== undefined && c !== undefined);
		const expected: AllowedTypesFullEvaluated[] = [];
		walkSchema([a], {
			allowedTypes: (types) => expected.push(types),
		});
		// Cache nothing, a dependency subgraph, or the entire graph; field callbacks must keep the same order.
		for (const cachedRoot of [undefined, c, a]) {
			const completed = new Set<TreeNodeSchema>();
			if (cachedRoot !== undefined) {
				walkSchema([cachedRoot], {
					stronglyConnectedComponent: (members) => {
						for (const member of members) {
							completed.add(member);
						}
					},
				});
			}
			const actual: AllowedTypesFullEvaluated[] = [];
			walkSchema([a], {
				stronglyConnectedComponent: () => {},
				allowedTypes: (types) => actual.push(types),
				wasComponentVisited: (schema) => completed.has(schema),
			});
			assert.deepEqual(actual, expected);
		}
	});

	// Test representative graph shapes against explicit partitions and dependency-first component ordering.
	for (const [name, edges, expected] of [
		["single", [[]], [[0]]],
		["self-cycle", [[0]], [[0]]],
		["cycle", [[1], [2], [0]], [[0, 1, 2]]],
		// Node 1's traversal frame finishes before node 2 refers to its unfinished component.
		["cycle through a finished sibling", [[1, 2], [0], [1]], [[0, 1, 2]]],
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
			const nodes = createSchemaGraph(edges);
			const completed = new Set<TreeNodeSchema>();
			const components: number[][] = [];
			walkSchema(nodes, {
				stronglyConnectedComponent: (members) => {
					const identities = new Set(members);
					assert.equal(identities.size, members.length, "Component members must be unique");
					for (const schema of members) {
						for (const field of getTreeNodeSchemaPrivateData(schema).childAllowedTypes) {
							for (const dependency of field.evaluateSet()) {
								assert(identities.has(dependency) || completed.has(dependency));
							}
						}
					}
					// Member order is unspecified, but component callback order must remain dependency-first.
					components.push(
						members.map((member) => nodes.indexOf(member)).sort((a, b) => a - b),
					);
					for (const member of identities) {
						assert(!completed.has(member));
						completed.add(member);
					}
				},
			});
			assert.deepEqual(components, expected);
		});
	}

	it("includes leaf identities and skips completed dependencies", () => {
		const sf = new SchemaFactoryAlpha("leafComponents");
		class Parent extends sf.array("Parent", sf.number) {}
		const completed = new Set<TreeNodeSchema>();
		const visits: TreeNodeSchema[] = [];
		// Complete the leaf first, then its parent, then repeat the parent to test dependency and root reuse.
		for (const root of [sf.number, Parent, Parent]) {
			walkSchema([root], {
				wasComponentVisited: (schema) => completed.has(schema),
				stronglyConnectedComponent: (members) => {
					for (const schema of members) {
						visits.push(schema);
						completed.add(schema);
					}
				},
			});
		}
		assert.deepEqual(visits, [sf.number, Parent]);
	});

	// Test deep chains and cycles to ensure lazy schema evaluation and traversal do not overflow the call stack.
	for (const cycle of [false, true]) {
		// Exercise both ordinary discovery and Tarjan analysis, since their bookkeeping differs.
		for (const observeComponents of [false, true]) {
			it(`handles a deep ${cycle ? "cycle" : "chain"} including lazy evaluation (components: ${observeComponents})`, () => {
				const depth = 5000;
				const nodes = createSchemaGraph(
					Array.from({ length: depth }, (_, i) =>
						i + 1 < depth ? [i + 1] : cycle ? [0] : [],
					),
				);
				const root = nodes[0] ?? assert.fail();
				const visited = new Set<TreeNodeSchema>();
				const components: (readonly TreeNodeSchema[])[] = [];
				walkSchema([root], {
					node: (schema) => {
						assert(!visited.has(schema));
						visited.add(schema);
					},
					stronglyConnectedComponent: observeComponents
						? (members) => components.push(members)
						: undefined,
				});
				assert.deepEqual(visited, new Set(nodes));
				if (observeComponents) {
					assert.equal(components.length, cycle ? 1 : depth);
					assert(components.every((members) => members.length === (cycle ? depth : 1)));
					assert.deepEqual(new Set(components.flat()), visited);
				} else {
					assert.equal(components.length, 0);
				}
			});
		}
	}
});
