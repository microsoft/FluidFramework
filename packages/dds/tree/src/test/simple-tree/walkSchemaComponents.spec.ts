/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	validateAssertionError,
	validateUsageError,
} from "@fluidframework/test-runtime-utils/internal";

import {
	getTreeNodeSchemaPrivateData,
	walkSchema,
	walkNodeSchema,
	type AllowedTypesFullEvaluated,
	type AnnotatedAllowedType,
	type IncrementalSchemaVisitor,
	type SchemaVisitor,
	type TreeNodeSchema,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../simple-tree/core/index.js";
import { SchemaFactoryAlpha } from "../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Exercise the field-root visitor entry point.
import { walkFieldSchema } from "../../simple-tree/walkFieldSchema.js";
import type { isAssignableTo, requireFalse, requireTrue } from "../../util/index.js";

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

	it("reports components on every ordinary walk and respects filtered topology", () => {
		const sf = new SchemaFactoryAlpha("componentNotifications");
		class A extends sf.objectRecursive("A", {
			child: sf.optionalRecursive([() => B]),
			leaf: sf.number,
		}) {}
		class B extends sf.objectRecursive("B", {
			child: sf.optionalRecursive(sf.types([sf.staged(() => A)])),
		}) {}
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
	});

	it("preserves node and field event order when component callbacks are enabled", () => {
		const [a, b, c] = graph([[1], [0, 2], []]);
		assert(a !== undefined && b !== undefined && c !== undefined);
		const ordinary: unknown[] = [];
		const withComponents: unknown[] = [];
		const completed = new Set<TreeNodeSchema>();
		walkNodeSchema(a, {
			node: (schema) => ordinary.push(schema),
			allowedTypes: (types) => ordinary.push(types),
		});
		walkNodeSchema(a, {
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
		});
		assert.deepEqual(withComponents, ordinary);
		assert.deepEqual(completed, new Set([a, b, c]));
	});

	it("visits complete cycles independently on each walk and handles empty roots", () => {
		const [a, b] = graph([[1], [0]]);
		assert(a !== undefined && b !== undefined);
		let calls = 0;
		for (let i = 0; i < 2; i++) {
			walkNodeSchema(a, {
				stronglyConnectedComponent: (members) => {
					calls++;
					assert.deepEqual(new Set(members), new Set([a, b]));
				},
			});
		}
		walkFieldSchema([], {
			stronglyConnectedComponent: () => assert.fail("Empty roots have no components"),
		});
		assert.equal(calls, 2);
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
		const [a, b, c, d] = graph([[1, 2, 1], [0], [3], []]);
		assert(a !== undefined && b !== undefined && c !== undefined && d !== undefined);
		const expected: AllowedTypesFullEvaluated[] = [];
		walkSchema([a], {
			allowedTypes: (types) => expected.push(types),
		});
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
			walkSchema(nodes, {
				stronglyConnectedComponent: (members) => {
					const identities = new Set(members);
					for (const schema of members) {
						for (const field of getTreeNodeSchemaPrivateData(schema).childAllowedTypes) {
							for (const dependency of field.evaluateSet()) {
								assert(identities.has(dependency) || completed.has(dependency));
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
		for (const observeComponents of [false, true]) {
			it(`handles a deep ${cycle ? "cycle" : "chain"} including lazy evaluation (components: ${observeComponents})`, () => {
				const depth = 5000;
				const nodes = graph(
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
