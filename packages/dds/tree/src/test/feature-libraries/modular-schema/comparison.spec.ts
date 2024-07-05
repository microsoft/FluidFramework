/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	type FieldKindIdentifier,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	type MutableTreeStoredSchema,
	ObjectNodeStoredSchema,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	TreeStoredSchemaRepository,
	type TreeTypeSet,
	ValueSchema,
	storedEmptyFieldSchema,
	type TreeStoredSchema,
} from "../../../core/index.js";
import { FieldKinds, defaultSchemaPolicy } from "../../../feature-libraries/index.js";
import {
	allowsFieldSuperset,
	allowsRepoSuperset,
	allowsTreeSchemaIdentifierSuperset,
	allowsTreeSuperset,
	allowsValueSuperset,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../../feature-libraries/modular-schema/comparison.js";
import { brand } from "../../../util/index.js";

/**
 * Helper for building {@link TreeFieldStoredSchema}.
 */
export function fieldSchema(
	kind: { identifier: FieldKindIdentifier },
	types?: Iterable<TreeNodeSchemaIdentifier>,
): TreeFieldStoredSchema {
	return {
		kind: kind.identifier,
		types: types === undefined ? undefined : new Set(types),
	};
}

describe("Schema Comparison", () => {
	/**
	 * TreeFieldStoredSchema permits anything.
	 * Note that children inside the field still have to be in schema.
	 */
	const anyField = fieldSchema(FieldKinds.sequence);

	/**
	 * TreeNodeStoredSchema that permits anything without a value.
	 * Note that children under the fields still have to be in schema.
	 */
	const anyTreeWithoutValue: TreeNodeStoredSchema = new MapNodeStoredSchema(anyField);

	const numberLeaf: TreeNodeStoredSchema = new LeafNodeStoredSchema(ValueSchema.Number);

	/**
	 * TreeFieldStoredSchema which is impossible for any data to be in schema with.
	 */
	const neverField = fieldSchema(FieldKinds.required, []);

	/**
	 * TreeNodeStoredSchema which is impossible for any data to be in schema with.
	 */
	const neverTree: TreeNodeStoredSchema = new MapNodeStoredSchema(neverField);

	const neverTree2: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
		new Map([[brand("x"), neverField]]),
	);

	const emptyTree = {
		name: brand<TreeNodeSchemaIdentifier>("empty"),
		schema: new ObjectNodeStoredSchema(new Map()),
	};

	const emptyLocalFieldTree = {
		name: brand<TreeNodeSchemaIdentifier>("emptyLocalFieldTree"),
		schema: new ObjectNodeStoredSchema(new Map([[brand("x"), storedEmptyFieldSchema]])),
	};

	const optionalLocalFieldTree = {
		name: brand<TreeNodeSchemaIdentifier>("optionalLocalFieldTree"),
		schema: new ObjectNodeStoredSchema(
			new Map([[brand("x"), fieldSchema(FieldKinds.optional, [emptyTree.name])]]),
		),
	};
	const valueLocalFieldTree = {
		name: brand<TreeNodeSchemaIdentifier>("valueLocalFieldTree"),
		schema: new ObjectNodeStoredSchema(
			new Map([[brand("x"), fieldSchema(FieldKinds.required, [emptyTree.name])]]),
		),
	};
	const valueAnyField = fieldSchema(FieldKinds.required);
	const valueEmptyTreeField = fieldSchema(FieldKinds.required, [emptyTree.name]);
	const optionalAnyField = fieldSchema(FieldKinds.optional);
	const optionalEmptyTreeField = fieldSchema(FieldKinds.optional, [emptyTree.name]);

	const optionalTreeWithoutValue: TreeNodeStoredSchema = new MapNodeStoredSchema(
		optionalAnyField,
	);

	const optionalEmptyTree: TreeNodeStoredSchema = new MapNodeStoredSchema(
		optionalEmptyTreeField,
	);
	const valueAnyTree: TreeNodeStoredSchema = new MapNodeStoredSchema(valueAnyField);
	const valueEmptyTree: TreeNodeStoredSchema = new MapNodeStoredSchema(valueEmptyTreeField);

	function updateTreeSchema(
		repo: MutableTreeStoredSchema,
		identifier: TreeNodeSchemaIdentifier,
		schema: TreeNodeStoredSchema,
	) {
		repo.apply({
			rootFieldSchema: repo.rootFieldSchema,
			nodeSchema: new Map([...repo.nodeSchema, [identifier, schema]]),
		});
	}

	it("allowsValueSuperset", () => {
		assert.equal(
			getOrdering(ValueSchema.FluidHandle, undefined, allowsValueSuperset),
			Ordering.Incomparable,
		);
		assert.equal(
			getOrdering(ValueSchema.Boolean, undefined, allowsValueSuperset),
			Ordering.Incomparable,
		);
		assert.equal(
			getOrdering(ValueSchema.Number, undefined, allowsValueSuperset),
			Ordering.Incomparable,
		);
		assert.equal(
			getOrdering(ValueSchema.String, undefined, allowsValueSuperset),
			Ordering.Incomparable,
		);
		assert.equal(
			getOrdering(ValueSchema.Null, undefined, allowsValueSuperset),
			Ordering.Incomparable,
		);
		testPartialOrder<ValueSchema | undefined>(allowsValueSuperset, [
			ValueSchema.Boolean,
			ValueSchema.Number,
			ValueSchema.String,
			ValueSchema.FluidHandle,
			ValueSchema.Null,
		]);
	});

	it("allowsTypesSuperset", () => {
		testOrder(allowsTreeSchemaIdentifierSuperset, [
			new Set(),
			new Set([brand("1")]),
			new Set([brand("1"), brand("2")]),
			undefined,
		]);
		const neverSet: TreeTypeSet = new Set();
		const neverSet2: TreeTypeSet = new Set();
		testPartialOrder(
			allowsTreeSchemaIdentifierSuperset,
			[
				neverSet,
				neverSet2,
				new Set([brand("1")]),
				new Set([brand("2")]),
				new Set([brand("1"), brand("2")]),
				undefined,
			],
			[[neverSet, neverSet2]],
		);
	});

	it("allowsFieldSuperset", () => {
		const repo = new TreeStoredSchemaRepository();
		updateTreeSchema(repo, brand("never"), neverTree);
		updateTreeSchema(repo, emptyTree.name, emptyTree.schema);
		const neverField2: TreeFieldStoredSchema = fieldSchema(FieldKinds.required, [
			brand("never"),
		]);
		const compare = (a: TreeFieldStoredSchema, b: TreeFieldStoredSchema): boolean =>
			allowsFieldSuperset(defaultSchemaPolicy, repo, a, b);
		testOrder(compare, [
			neverField,
			storedEmptyFieldSchema,
			optionalEmptyTreeField,
			optionalAnyField,
			anyField,
		]);
		testOrder(compare, [neverField, valueEmptyTreeField, valueAnyField, anyField]);
		assert.equal(
			getOrdering(valueEmptyTreeField, storedEmptyFieldSchema, compare),
			Ordering.Incomparable,
		);
		testPartialOrder(
			compare,
			[
				neverField,
				neverField2,
				storedEmptyFieldSchema,
				anyField,
				valueEmptyTreeField,
				valueAnyField,
				valueEmptyTreeField,
				valueAnyField,
			],
			[[neverField, neverField2]],
		);
	});

	// This helps provide some coverage for our schema evolution story, since repo compatibility
	// influences the types of schema changes we allow
	describe("allowsRepoSuperset", () => {
		const compareTwoRepo = (a: TreeStoredSchema, b: TreeStoredSchema): boolean => {
			return allowsRepoSuperset(defaultSchemaPolicy, a, b);
		};

		const createTestTree = (fields: [string, TreeFieldStoredSchema][]) => ({
			name: brand<TreeNodeSchemaIdentifier>("testTree"),
			schema: new ObjectNodeStoredSchema(
				new Map(fields.map(([key, schema]) => [brand(key), schema])),
			),
		});

		it("Fix the rootFieldSchema and validate repo superset with different TreeNodeStoredSchemas", () => {
			const rootFieldSchema = fieldSchema(FieldKinds.forbidden);

			const testTrees = [
				createTestTree([["x", fieldSchema(FieldKinds.required, [emptyTree.name])]]),
				createTestTree([]),
				createTestTree([["x", fieldSchema(FieldKinds.optional, [emptyTree.name])]]),
				createTestTree([
					["x", fieldSchema(FieldKinds.optional, [emptyTree.name])],
					["y", fieldSchema(FieldKinds.optional, [emptyTree.name])],
				]),
				{ name: brand<TreeNodeSchemaIdentifier>("testTree"), schema: anyTreeWithoutValue },
			];

			const repos = testTrees.map((testTree) => {
				return new TreeStoredSchemaRepository({
					rootFieldSchema,
					nodeSchema: new Map([[testTree.name, testTree.schema]]),
				});
			});

			testOrder(compareTwoRepo, repos);
		});

		it("Fix the TreeNodeStoredSchema and validate repo superset with different rootFieldSchemas", () => {
			const rootFieldSchemas = [
				fieldSchema(FieldKinds.required),
				fieldSchema(FieldKinds.optional),
				fieldSchema(FieldKinds.sequence),
			];

			const testTree = {
				name: brand<TreeNodeSchemaIdentifier>("testTree"),
				schema: valueAnyTree,
			};

			const repos = rootFieldSchemas.map((rootFieldSchema) => {
				return new TreeStoredSchemaRepository({
					rootFieldSchema,
					nodeSchema: new Map([[testTree.name, testTree.schema]]),
				});
			});

			testOrder(compareTwoRepo, repos);
		});

		it("Validate the ordering when the identifiers are different", () => {
			// TODO: AB#8357, Improve allowsTreeSuperset to ensure it can distinguish between different identifiers.
			const root = fieldSchema(FieldKinds.optional);
			const node1 = {
				name: brand<TreeNodeSchemaIdentifier>("testTree"),
				schema: valueAnyTree,
			};
			const node2 = {
				name: brand<TreeNodeSchemaIdentifier>("testTree2"),
				schema: new ObjectNodeStoredSchema(new Map()),
			};
			const repo1 = new TreeStoredSchemaRepository({
				rootFieldSchema: root,
				nodeSchema: new Map([[node1.name, node1.schema]]),
			});
			const repo2 = new TreeStoredSchemaRepository({
				rootFieldSchema: root,
				nodeSchema: new Map([[node2.name, node2.schema]]),
			});
			testOrder(compareTwoRepo, [repo1, repo2]);
		});

		it("The ordering should be incomparable when there is an `intersection`", () => {
			/**
			 * The rootFieldSchema of repo1 is a superset of that in repo2, but the TreeFieldStoredSchema
			 * of repo2 is a superset of that in repo1. Therefore, the final ordering should be considered
			 * incomparable.
			 */
			const root1 = fieldSchema(FieldKinds.optional);
			const root2 = fieldSchema(FieldKinds.required);

			const testTree1 = {
				name: brand<TreeNodeSchemaIdentifier>("testTree"),
				schema: new ObjectNodeStoredSchema(
					new Map([[brand("x"), fieldSchema(FieldKinds.required, [emptyTree.name])]]),
				),
			};
			const testTree2 = {
				name: brand<TreeNodeSchemaIdentifier>("testTree"),
				schema: new ObjectNodeStoredSchema(
					new Map([[brand("x"), fieldSchema(FieldKinds.optional, [emptyTree.name])]]),
				),
			};
			const repo1 = new TreeStoredSchemaRepository({
				rootFieldSchema: root1,
				nodeSchema: new Map([[testTree1.name, testTree1.schema]]),
			});
			const repo2 = new TreeStoredSchemaRepository({
				rootFieldSchema: root2,
				nodeSchema: new Map([[testTree2.name, testTree2.schema]]),
			});
			assert.equal(getOrdering(repo1, repo2, compareTwoRepo), Ordering.Incomparable);
		});

		it("The ordering should be incomparable when fields mismatch", () => {
			const root = fieldSchema(FieldKinds.optional);

			const testTree1 = {
				name: brand<TreeNodeSchemaIdentifier>("testTree"),
				schema: new ObjectNodeStoredSchema(
					new Map([
						[brand("x"), fieldSchema(FieldKinds.optional, [emptyTree.name])],
						[brand("y"), fieldSchema(FieldKinds.optional, [emptyTree.name])],
					]),
				),
			};
			const testTree2 = {
				name: brand<TreeNodeSchemaIdentifier>("testTree"),
				schema: new ObjectNodeStoredSchema(
					new Map([[brand("x"), fieldSchema(FieldKinds.sequence, [emptyTree.name])]]),
				),
			};
			const repo1 = new TreeStoredSchemaRepository({
				rootFieldSchema: root,
				nodeSchema: new Map([[testTree1.name, testTree1.schema]]),
			});
			const repo2 = new TreeStoredSchemaRepository({
				rootFieldSchema: root,
				nodeSchema: new Map([[testTree2.name, testTree2.schema]]),
			});
			assert.equal(getOrdering(repo1, repo2, compareTwoRepo), Ordering.Incomparable);
		});
	});

	it("allowsTreeSuperset-no leaf values", () => {
		const repo = new TreeStoredSchemaRepository();
		updateTreeSchema(repo, emptyTree.name, emptyTree.schema);
		const compare = (
			a: TreeNodeStoredSchema | undefined,
			b: TreeNodeStoredSchema | undefined,
		): boolean => allowsTreeSuperset(defaultSchemaPolicy, repo, a, b);
		testOrder(compare, [
			neverTree,
			emptyTree.schema,
			optionalLocalFieldTree.schema,
			anyTreeWithoutValue,
		]);
		testPartialOrder(
			compare,
			[
				neverTree,
				neverTree2,
				undefined,
				anyTreeWithoutValue,
				emptyTree.schema,
				emptyLocalFieldTree.schema,
				optionalLocalFieldTree.schema,
				valueLocalFieldTree.schema,
			],
			[
				[neverTree, neverTree2, undefined],
				[emptyTree.schema, emptyLocalFieldTree.schema],
			],
		);
	});

	it("allowsTreeSuperset-leaf values", () => {
		const repo = new TreeStoredSchemaRepository();
		updateTreeSchema(repo, emptyTree.name, emptyTree.schema);
		const compare = (
			a: TreeNodeStoredSchema | undefined,
			b: TreeNodeStoredSchema | undefined,
		): boolean => allowsTreeSuperset(defaultSchemaPolicy, repo, a, b);
		testOrder(compare, [neverTree, numberLeaf]);
		testPartialOrder(
			compare,
			[neverTree, neverTree2, undefined, numberLeaf],
			[[neverTree, neverTree2, undefined]],
		);
	});
});

enum Ordering {
	Subset,
	Equal,
	Incomparable,
	Superset,
}

function getOrdering<T>(
	original: T,
	superset: T,
	allowsSuperset: (a: T, b: T) => boolean,
): Ordering {
	assert(allowsSuperset(original, original));
	assert(allowsSuperset(superset, superset));
	const a = allowsSuperset(original, superset);
	const b = allowsSuperset(superset, original);
	if (a && b) {
		return Ordering.Equal;
	}
	if (a && !b) {
		return Ordering.Superset;
	}
	if (!a && b) {
		return Ordering.Subset;
	}
	return Ordering.Incomparable;
}

function testOrder<T>(compare: (a: T, b: T) => boolean, inOrder: T[]): void {
	for (let index = 0; index < inOrder.length - 1; index++) {
		const order = getOrdering(inOrder[index], inOrder[index + 1], compare);
		if (order !== Ordering.Superset) {
			assert.fail(
				`expected ${JSON.stringify(
					intoSimpleObject(inOrder[index + 1]),
				)} to be a superset of ${JSON.stringify(intoSimpleObject(inOrder[index]))} but was ${
					Ordering[order]
				}`,
			);
		}
	}
}

/**
 * Tests a comparison function, ensuring it produces a non-strict partial order over the provided values.
 * https://en.wikipedia.org/wiki/Partially_ordered_set#Non-strict_partial_order
 */
function testPartialOrder<T>(
	compare: (a: T, b: T) => boolean,
	values: T[],
	expectedEqual: T[][] = [],
): void {
	// To be a strict partial order, the function must be:
	// Reflexivity: a ≤ a
	// Antisymmetry: if a ≤ b and b ≤ a then a = b
	// Transitivity: if a ≤ b  and  b ≤ c  then  a ≤ c

	// This is brute forced in O(n^3) time below:
	// Violations:
	const reflexivity: T[] = [];
	const antisymmetry: [boolean, T, T][] = [];
	const transitivity: T[][] = [];

	const expectedEqualMap: Map<T, Set<T>> = new Map();
	for (const group of expectedEqual) {
		const set = new Set(group);
		for (const item of group) {
			expectedEqualMap.set(item, set);
		}
	}

	for (const a of values) {
		if (!compare(a, a)) {
			reflexivity.push(a);
		}

		for (const b of values) {
			const expectEqual = a === b || (expectedEqualMap.get(a)?.has(b) ?? false);
			if ((compare(a, b) && compare(b, a)) !== expectEqual) {
				antisymmetry.push([expectEqual, a, b] as [boolean, T, T]);
			}

			for (const c of values) {
				if (compare(a, b) && compare(b, c)) {
					if (!compare(a, c)) {
						transitivity.push([a, b, c]);
					}
				}
			}
		}
	}
	assert.deepEqual(intoSimpleObject(reflexivity), [], "reflexivity");
	assert.deepEqual(intoSimpleObject(antisymmetry), [], "antisymmetry");
	assert.deepEqual(intoSimpleObject(transitivity), [], "transitivity");
}

/**
 * Flatten maps and arrays into simple objects for better printing.
 */
function intoSimpleObject(obj: unknown): unknown {
	if (typeof obj !== "object" || obj === null) {
		return obj;
	}
	if (obj instanceof Array) {
		return Array.from(obj, intoSimpleObject);
	}
	if (obj instanceof Map) {
		return Array.from(obj, ([key, value]): [unknown, unknown] => [
			key,
			intoSimpleObject(value),
		]);
	}
	if (obj instanceof Set) {
		return Array.from(obj as ReadonlySet<string>);
	}
	const out: Record<string, unknown> = {};
	// eslint-disable-next-line no-restricted-syntax
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			out[key] = intoSimpleObject((obj as Record<string, unknown>)[key]);
		}
	}
	return out;
}
