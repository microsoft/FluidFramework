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
	type AnnotatedAllowedType,
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
import type {
	areSafelyAssignable,
	isAssignableTo,
	requireFalse,
	requireTrue,
} from "../../util/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Exercise the field-root visitor entry point.
import { walkFieldSchema } from "../../simple-tree/walkFieldSchema.js";

type _sharedFieldCallback = requireTrue<
	areSafelyAssignable<IncrementalSchemaVisitor["allowedTypes"], SchemaVisitor["allowedTypes"]>
>;
type _sharedTypeFilter = requireTrue<
	areSafelyAssignable<
		IncrementalSchemaVisitor["allowedTypeFilter"],
		SchemaVisitor["allowedTypeFilter"]
	>
>;
type _sharedComponentCallback = requireTrue<
	areSafelyAssignable<
		IncrementalSchemaVisitor["stronglyConnectedComponent"],
		NonNullable<SchemaVisitor["stronglyConnectedComponent"]>
	>
>;
type _incrementalIsNotOrdinary = requireFalse<
	isAssignableTo<IncrementalSchemaVisitor, SchemaVisitor>
>;

/**
 * Creates fresh schema identities from adjacency lists, with lazy references supporting forward edges and cycles.
 */
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

	for (const observeFields of [false, true]) {
		it(`reuses components only for the matching filtered graph (fields: ${observeFields})`, () => {
			const sf = new SchemaFactoryAlpha("incrementalFiltering");
			class A extends sf.objectRecursive("A", {
				child: sf.optionalRecursive([() => B]),
			}) {}
			class B extends sf.objectRecursive("B", {
				child: sf.optionalRecursive(sf.types([sf.staged(() => A)])),
			}) {}
			for (const includeStaged of [false, true]) {
				const completed = new Set<TreeNodeSchema>();
				const components: (readonly TreeNodeSchema[])[] = [];
				const fields: AllowedTypesFullEvaluated[] = [];
				const filter = (type: AnnotatedAllowedType<TreeNodeSchema>): boolean =>
					includeStaged || type.metadata.stagedSchemaUpgrade === undefined;
				const visitor: IncrementalSchemaVisitor = {
					allowedTypeFilter: filter,
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
				const count = components.length;
				walkSchema([A], visitor);
				assert.equal(components.length, includeStaged ? count : count + 1);
				assert.deepEqual(
					components.map((members) => new Set(members)),
					includeStaged ? [new Set([A, B])] : [new Set([B]), new Set([A])],
				);
				fields.length = 0;
				walkSchema([A], visitor);
				assert.equal(fields.length, observeFields ? 2 : 0);
			}
		});
	}

	it("rejects invalid incremental visitor combinations in types and at runtime", () => {
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
		for (const visitor of [missingCallback, withNode]) {
			assert.throws(
				// @ts-expect-error Invalid combinations are rejected even through variables.
				() => walkSchema([], visitor),
				validateAssertionError(/Incremental component visits require/),
			);
		}
		// @ts-expect-error An ordinary visitor cannot hide a previous-component predicate.
		const ordinary: SchemaVisitor = incremental;
		assert.strictEqual(ordinary, incremental);
	});

	it("does not require the caller to record component visits during this walk", () => {
		const [a, b, c] = graph([[1, 1, 2], [0, 2], []]);
		assert(a !== undefined && b !== undefined && c !== undefined);
		const earlierVisits = new Set([c]);
		for (const observeFields of [false, true]) {
			const components: (readonly TreeNodeSchema[])[] = [];
			const fields: AllowedTypesFullEvaluated[] = [];
			const visitor: IncrementalSchemaVisitor = {
				wasComponentVisited: (schema) => earlierVisits.has(schema),
				stronglyConnectedComponent: (members) => components.push(members),
				allowedTypes: observeFields ? (types) => fields.push(types) : undefined,
			};
			walkSchema([a, b, c], visitor);
			assert.deepEqual(
				components.map((members) => new Set(members)),
				[new Set([a, b])],
			);
			assert.equal(fields.length, observeFields ? 3 : 0);
			assert.deepEqual(earlierVisits, new Set([c]));
			if (observeFields) {
				fields.length = 0;
				walkSchema([a, b, c], visitor, new Set([c]));
				assert.equal(fields.length, 2);
			}
		}
	});

	it("uses schema identity rather than identifiers without populating analysis caches", () => {
		const sf = new SchemaFactoryAlpha("componentIdentity");
		class A extends sf.object("Duplicate", {}) {}
		class B extends sf.object("Duplicate", {}) {}
		const components: (readonly TreeNodeSchema[])[] = [];
		walkFieldSchema([A, B, A], {
			stronglyConnectedComponent: (members) => components.push(members),
		});
		assert.deepEqual(components, [[A], [B]]);
		assert.equal(getTreeNodeSchemaPrivateData(A).component, undefined);
		assert.equal(getTreeNodeSchemaPrivateData(B).component, undefined);
	});

	it("does not report unfinished components after a visitor throws", () => {
		const [a, b, leaf] = graph([[2, 1], [0], []]);
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

	it("reports cached components on every ordinary walk and respects filtered topology", () => {
		const sf = new SchemaFactoryAlpha("componentNotifications");
		class A extends sf.objectRecursive("A", {
			child: sf.optionalRecursive([() => B]),
			leaf: sf.number,
		}) {}
		class B extends sf.objectRecursive("B", {
			child: sf.optionalRecursive(sf.types([sf.staged(() => A)])),
		}) {}
		getSchemaDerivedData(A);
		for (const filtered of [false, true, false]) {
			const components: TreeNodeSchema[][] = [];
			const visited = new Set<TreeNodeSchema>();
			walkFieldSchema(B, {
				allowedTypeFilter: (type) =>
					!filtered || type.metadata.stagedSchemaUpgrade === undefined,
				node: (schema) => visited.add(schema),
				stronglyConnectedComponent: (members) => {
					assert(members.every((member) => visited.has(member)));
					components.push([...members]);
				},
			});
			assert.deepEqual(
				components.map((members) => new Set(members)),
				filtered ? [new Set([B])] : [new Set([sf.number]), new Set([A, B])],
			);
			assert.equal(components.flat().length, visited.size);
		}
		assert.equal(getSchemaDerivedData(A).unhydratedContext, undefined);
	});

	it("preserves node and field event order when component callbacks are enabled", () => {
		const [a, b, c] = graph([[1], [0, 2], []]);
		assert(a !== undefined && b !== undefined && c !== undefined);
		const ordinary: unknown[] = [];
		const withComponents: unknown[] = [];
		const completed = new Set<TreeNodeSchema>();
		walkNodeSchema(
			a,
			{
				node: (schema) => ordinary.push(schema),
				allowedTypes: (types) => ordinary.push(types),
			},
			new Set(),
		);
		walkNodeSchema(
			a,
			{
				node: (schema) => withComponents.push(schema),
				allowedTypes: (types) => withComponents.push(types),
				stronglyConnectedComponent: (members) => {
					assert(members.every((member) => withComponents.includes(member)));
					if (members.includes(a)) {
						assert(completed.has(c));
						assert(members.includes(b));
					}
					for (const member of members) {
						assert(!completed.has(member));
						completed.add(member);
					}
				},
			},
			new Set(),
		);
		assert.deepEqual(withComponents, ordinary);
		assert.deepEqual(completed, new Set([a, b, c]));
	});

	it("excludes previously visited nodes and handles empty roots", () => {
		const [a, b] = graph([[1], [0]]);
		assert(a !== undefined && b !== undefined);
		const seen = new Set([b]);
		let calls = 0;
		walkNodeSchema(
			a,
			{
				stronglyConnectedComponent: (members) => {
					calls++;
					// The visited-set boundary removes B and its edges from this walk.
					assert.deepEqual(members, [a]);
				},
			},
			seen,
		);
		walkFieldSchema([], {
			stronglyConnectedComponent: () => assert.fail("Empty roots have no components"),
		});
		assert.equal(calls, 1);
		assert.deepEqual(seen, new Set([a, b]));
	});

	it("prunes completed references before yielding them, without dropping annotations", () => {
		const sf = new SchemaFactoryAlpha("prunedReferences");
		const types = sf.types([sf.number, sf.staged(sf.number)]);
		class Parent extends sf.objectAlpha(
			"Parent",
			Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`field${i}`, types])),
		) {}
		types.evaluate();
		// Count yielded cached references, not just discovered nodes: redundant iterator work must also be avoided.
		// The generator prototype is restored in finally so this instrumentation does not affect later tests.
		const prototype = Object.getPrototypeOf(
			Object.getPrototypeOf((function* () {})()),
		) as Generator<unknown, unknown, unknown>;
		const next = prototype.next;
		let cachedYields = 0;
		let fields: readonly AllowedTypesFullEvaluated[] | undefined;
		prototype.next = function (
			this: Generator<unknown, unknown, unknown>,
			...args: [] | [unknown]
		): IteratorResult<unknown, unknown> {
			const result = next.apply(this, args);
			if (result.done !== true && result.value === sf.number) {
				cachedYields++;
			}
			return result;
		};
		try {
			walkSchema([Parent], {
				wasComponentVisited: (schema) => schema === sf.number,
				stronglyConnectedComponent: (members) => {
					assert.equal(members.length, 1);
					assert.equal(members[0], Parent);
					fields = getTreeNodeSchemaPrivateData(Parent).childAllowedTypes.map((field) =>
						field.evaluate(),
					);
				},
			});
		} finally {
			prototype.next = next;
		}
		assert.equal(cachedYields, 0);
		assert.equal(fields?.length, 32);
		for (const field of fields ?? assert.fail()) {
			assert.equal(field.types.length, 2);
			assert.equal(field.types[0]?.type, sf.number);
			assert.equal(field.types[1]?.type, sf.number);
			assert.notEqual(field.types[1]?.metadata.stagedSchemaUpgrade, undefined);
		}
	});

	it("validates most-derived identity before querying previous visits on validating walks", () => {
		const sf = new SchemaFactoryAlpha("validationBeforeCache");
		const Base = sf.object("Base", {});
		class Used extends Base {}
		class Invalid extends Base {}
		getSchemaDerivedData(Used);
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
		const [a, b, c, d] = graph([[1, 2, 1], [0], [3], []]);
		assert(a !== undefined && b !== undefined && c !== undefined && d !== undefined);
		const root = normalizeFieldSchema(a);
		const expected: AllowedTypesFullEvaluated[] = [];
		walkAllowedTypes(root.allowedTypesFull.evaluate(), {
			allowedTypes: (types) => expected.push(types),
		});
		// walkSchema starts at node roots, so it does not report the field wrapper used by walkAllowedTypes.
		expected.pop();
		for (const cachedRoot of [undefined, c, a]) {
			if (cachedRoot !== undefined) {
				getSchemaDerivedData(cachedRoot);
			}
			const actual: AllowedTypesFullEvaluated[] = [];
			walkSchema([a], {
				stronglyConnectedComponent: () => {},
				allowedTypes: (types) => actual.push(types),
				wasComponentVisited: (schema) =>
					getTreeNodeSchemaPrivateData(schema).component !== undefined,
			});
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
			walkAllowedTypes(normalizeFieldSchema(nodes).allowedTypesFull.evaluate(), {
				stronglyConnectedComponent: (members) => {
					const identities = new Set(members);
					for (const schema of members) {
						for (const field of getTreeNodeSchemaPrivateData(schema).childAllowedTypes) {
							for (const type of field.evaluate().types) {
								assert(identities.has(type.type) || completed.has(type.type));
							}
						}
					}
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
		assert.strictEqual(a.component, getTreeNodeSchemaPrivateData(B).component);
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
});
