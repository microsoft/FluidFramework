/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { createSchemaGraph } from "./schemaTestUtils.js";

import {
	validateAssertionError,
	validateUsageError,
} from "@fluidframework/test-runtime-utils/internal";

import {
	getTreeNodeSchemaPrivateData,
	walkSchema,
	walkNodeSchema,
	type AllowedTypesFullEvaluated,
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

	// Include and exclude the staged back-edge to test reuse with cyclic and acyclic filtered graphs.
	for (const includeStaged of [false, true]) {
		it(`reuses completed components within a filtered graph (staged: ${includeStaged})`, () => {
			const sf = new SchemaFactoryAlpha("incrementalFiltering");
			class A extends sf.objectRecursive("A", {
				child: sf.optionalRecursive([() => B]),
			}) {}
			class B extends sf.objectRecursive("B", {
				child: sf.optionalRecursive(sf.types([sf.staged(() => A)])),
			}) {}
			const completed = new Set<TreeNodeSchema>();
			const components: (readonly TreeNodeSchema[])[] = [];
			const visitor: IncrementalSchemaVisitor = {
				allowedTypeFilter: (type) =>
					includeStaged || type.metadata.stagedSchemaUpgrade === undefined,
				wasComponentVisited: (schema) => completed.has(schema),
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
			walkSchema([A], visitor);
			assert.deepEqual(components, []);
		});
	}

	it("validates incremental visitor requirements in types and at runtime", () => {
		const incremental: IncrementalSchemaVisitor = {
			wasComponentVisited: () => false,
			stronglyConnectedComponent: () => {},
		};
		walkSchema([], incremental);
		const missingCallback = { wasComponentVisited: () => false };
		const withNode = { ...incremental, node: () => {} };
		const withAllowedTypes = { ...incremental, allowedTypes: () => {} };
		const withFilter = { ...incremental, allowedTypeFilter: () => true };
		type _missingComponentCallback = requireFalse<
			isAssignableTo<typeof missingCallback, Parameters<typeof walkSchema>[1]>
		>;
		type _nodeCallbackExcluded = requireFalse<
			isAssignableTo<typeof withNode, Parameters<typeof walkSchema>[1]>
		>;
		type _allowedTypesCallbackExcluded = requireFalse<
			isAssignableTo<typeof withAllowedTypes, Parameters<typeof walkSchema>[1]>
		>;
		type _filterAllowed = requireTrue<
			isAssignableTo<typeof withFilter, Parameters<typeof walkSchema>[1]>
		>;
		walkSchema([], withFilter);
		// Reject missing component callbacks and incompatible observation callbacks, even through variables.
		for (const visitor of [missingCallback, withNode, withAllowedTypes]) {
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
		const components: (readonly TreeNodeSchema[])[] = [];
		const visitor: IncrementalSchemaVisitor = {
			wasComponentVisited: (schema) => earlierVisits.has(schema),
			stronglyConnectedComponent: (members) => components.push(members),
		};
		walkSchema([a, b, c], visitor);
		assert.deepEqual(
			components.map((members) => new Set(members)),
			[new Set([a, b])],
		);
		assert.deepEqual(earlierVisits, new Set([c]));
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

	it("does not evaluate completed components' fields", () => {
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

	it("reports complete annotations for each field despite filtering and repeated dependencies", () => {
		const sf = new SchemaFactoryAlpha("fieldAnnotations");
		const types = sf.types([sf.number, sf.staged(sf.number), sf.string]);
		class Parent extends sf.objectAlpha("Parent", { first: types, second: types }) {}
		const fields: AllowedTypesFullEvaluated[] = [];
		const components: (readonly TreeNodeSchema[])[] = [];
		walkSchema([Parent], {
			allowedTypeFilter: ({ type }) => type !== sf.string,
			allowedTypes: (field) => fields.push(field),
			stronglyConnectedComponent: (members) => components.push(members),
		});
		assert.deepEqual(components, [[sf.number], [Parent]]);
		assert.deepEqual(fields, [types.evaluate(), types.evaluate()]);
	});

	it("validates most-derived identity before reporting fields or components", () => {
		const sf = new SchemaFactoryAlpha("validationBeforeCallbacks");
		const Base = sf.object("Base", {});
		class Used extends Base {}
		class Invalid extends Base {}
		walkSchema([Used], {});
		assert.throws(
			() =>
				walkSchema([Invalid], {
					stronglyConnectedComponent: () => assert.fail("Invalid nodes must not be reported"),
					allowedTypes: () => assert.fail("Invalid nodes' fields must not be reported"),
				}),
			validateUsageError(/Two schema classes were used/),
		);
	});

	it("preserves ordinary allowed-type callback order when component callbacks are present", () => {
		const [a] = createSchemaGraph([[1, 2, 1], [0], [3], []]);
		assert(a !== undefined);
		const expected: AllowedTypesFullEvaluated[] = [];
		walkSchema([a], {
			allowedTypes: (types) => expected.push(types),
		});
		for (let i = 0; i < 2; i++) {
			const actual: AllowedTypesFullEvaluated[] = [];
			walkSchema([a], {
				stronglyConnectedComponent: () => {},
				allowedTypes: (types) => actual.push(types),
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
