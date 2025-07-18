/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
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
import { fieldSchema } from "../../utils.js";

describe("Schema Comparison", () => {
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

	const fieldOptionalEmptyTree = fieldSchema(FieldKinds.optional, [emptyTree.name]);
	const fieldRequiredEmptyTree = fieldSchema(FieldKinds.required, [emptyTree.name]);

	// With x field that is storedEmptyFieldSchema
	const nodeWithEmptyXField = new ObjectNodeStoredSchema(
		new Map([[brand("x"), storedEmptyFieldSchema]]),
	);

	// With x field that optionally contains emptyTree
	const nodeWithOptionalXField = new ObjectNodeStoredSchema(
		new Map([[brand("x"), fieldOptionalEmptyTree]]),
	);

	// With x field that contains emptyTree
	const nodeWithRequiredXField = new ObjectNodeStoredSchema(
		new Map([[brand("x"), fieldRequiredEmptyTree]]),
	);

	// With x and y fields which optionality contain emptyTree
	const nodeWithOptionalXAndYFields = new ObjectNodeStoredSchema(
		new Map([
			[brand("x"), fieldSchema(FieldKinds.optional, [emptyTree.name])],
			[brand("y"), fieldSchema(FieldKinds.optional, [emptyTree.name])],
		]),
	);

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
		testOrder(compare, [neverField, storedEmptyFieldSchema, fieldOptionalEmptyTree]);
		testOrder(compare, [neverField, fieldRequiredEmptyTree]);
		assert.equal(
			getOrdering(fieldRequiredEmptyTree, storedEmptyFieldSchema, compare),
			Ordering.Incomparable,
		);
		testPartialOrder(
			compare,
			[
				neverField,
				neverField2,
				storedEmptyFieldSchema,
				fieldRequiredEmptyTree,
				fieldRequiredEmptyTree,
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

		it("Same rootFieldSchema with different TreeNodeStoredSchemas", () => {
			// Test a bunch of different TreeStoredSchema which all are all the same,
			// except one node schema (identified by `schemaName` in them has changed.

			const schemaName = brand<TreeNodeSchemaIdentifier>("testTree");

			function createTestCase(
				nodeSchema: TreeNodeStoredSchema,
				...extra: { name: TreeNodeSchemaIdentifier; schema: TreeNodeStoredSchema }[]
			): TreeStoredSchema {
				return new TreeStoredSchemaRepository({
					rootFieldSchema: fieldSchema(FieldKinds.optional, [schemaName, emptyTree.name]),
					nodeSchema: new Map([
						[schemaName, nodeSchema],
						[emptyTree.name, emptyTree.schema],
						...extra.map(({ name, schema }) => [name, schema] as const),
					]),
				});
			}

			const emptyNode = createTestCase(emptyTree.schema);
			const withEmptyXField = createTestCase(nodeWithEmptyXField);
			const withOptionalXField = createTestCase(nodeWithOptionalXField);
			const withRequiredXField = createTestCase(nodeWithRequiredXField);
			const withOptionalXAndYFields = createTestCase(nodeWithOptionalXAndYFields);

			const emptyRepo = new TreeStoredSchemaRepository({
				rootFieldSchema: storedEmptyFieldSchema,
				nodeSchema: new Map(),
			});

			// Initializing
			testOrder(compareTwoRepo, [emptyRepo, emptyNode]);

			// Making a field optional
			testOrder(compareTwoRepo, [withEmptyXField, withRequiredXField, withOptionalXField]);

			// Adding an optional field
			testOrder(compareTwoRepo, [withOptionalXField, withOptionalXAndYFields]);

			// Required fields can not be added or removed
			assert.equal(
				getOrdering(withRequiredXField, emptyNode, compareTwoRepo),
				Ordering.Incomparable,
			);

			// Two changes with opposite compatibility directions results in incompatibility.
			assert.equal(
				getOrdering(withRequiredXField, withOptionalXAndYFields, compareTwoRepo),
				Ordering.Incomparable,
			);

			testPartialOrder(
				compareTwoRepo,
				[
					emptyRepo,
					emptyNode,
					withEmptyXField,
					withOptionalXField,
					withOptionalXAndYFields,
					withRequiredXField,
				],
				[[emptyNode, withEmptyXField]],
			);
		});

		it("Differing root kinds", () => {
			const rootFieldSchemas = [
				fieldSchema(FieldKinds.required, [emptyTree.name]),
				fieldSchema(FieldKinds.optional, [emptyTree.name]),
				fieldSchema(FieldKinds.sequence, [emptyTree.name]),
			];

			const repos = rootFieldSchemas.map((rootFieldSchema) => {
				return new TreeStoredSchemaRepository({
					rootFieldSchema,
					nodeSchema: new Map([[emptyTree.name, emptyTree.schema]]),
				});
			});

			testOrder(compareTwoRepo, repos);
			testPartialOrder(compareTwoRepo, repos);
		});

		it("Validate the ordering when the identifiers are different", () => {
			const repo1 = new TreeStoredSchemaRepository({
				rootFieldSchema: fieldSchema(FieldKinds.optional, [brand("A")]),
				nodeSchema: new Map([[brand("A"), emptyTree.schema]]),
			});
			const repo2 = new TreeStoredSchemaRepository({
				rootFieldSchema: fieldSchema(FieldKinds.optional, [brand("B")]),
				nodeSchema: new Map([[brand("B"), emptyTree.schema]]),
			});
			assert.equal(getOrdering(repo1, repo2, compareTwoRepo), Ordering.Incomparable);
		});

		it("The ordering should be incomparable when there is an `intersection`", () => {
			/**
			 * The rootFieldSchema of repo1 is a superset of that in repo2, but the TreeFieldStoredSchema
			 * of repo2 is a superset of that in repo1. Therefore, the final ordering should be considered
			 * incomparable.
			 */
			const name = brand<TreeNodeSchemaIdentifier>("testTree");
			const root1 = fieldSchema(FieldKinds.optional, [name]);
			const root2 = fieldSchema(FieldKinds.required, [name]);

			const testTree1 = new MapNodeStoredSchema(fieldSchema(FieldKinds.optional, []));
			const testTree2 = new MapNodeStoredSchema(fieldSchema(FieldKinds.optional, [name]));
			const repo1 = new TreeStoredSchemaRepository({
				rootFieldSchema: root1,
				nodeSchema: new Map([[name, testTree1]]),
			});
			const repo2 = new TreeStoredSchemaRepository({
				rootFieldSchema: root2,
				nodeSchema: new Map([[name, testTree2]]),
			});
			assert.equal(getOrdering(repo1, repo2, compareTwoRepo), Ordering.Incomparable);
		});

		it("The ordering should be incomparable when fields mismatch", () => {
			const name = brand<TreeNodeSchemaIdentifier>("testTree");
			const root = fieldSchema(FieldKinds.optional, [name]);

			const testTree1 = nodeWithOptionalXAndYFields;
			const testTree2 = new ObjectNodeStoredSchema(
				new Map([[brand("x"), fieldSchema(FieldKinds.sequence, [emptyTree.name])]]),
			);
			const repo1 = new TreeStoredSchemaRepository({
				rootFieldSchema: root,
				nodeSchema: new Map([
					[name, testTree1],
					[emptyTree.name, emptyTree.schema],
				]),
			});
			const repo2 = new TreeStoredSchemaRepository({
				rootFieldSchema: root,
				nodeSchema: new Map([
					[name, testTree2],
					[emptyTree.name, emptyTree.schema],
				]),
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
		testOrder(compare, [neverTree, emptyTree.schema, nodeWithOptionalXField]);
		testPartialOrder(
			compare,
			[
				neverTree,
				neverTree2,
				undefined,
				emptyTree.schema,
				nodeWithEmptyXField,
				nodeWithOptionalXField,
				nodeWithRequiredXField,
			],
			[
				[neverTree, neverTree2, undefined],
				[emptyTree.schema, nodeWithEmptyXField],
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

	it("testOrder", () => {
		testOrder((a, b) => a <= b, [0, 1, 2]);
		assert.throws(() => testOrder((a, b) => a <= b, [0, 1, 1]));
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

/**
 * Tests that `inOrder` is in order according to `compare`.
 * @remarks
 * Compare must return true when given equal values, or a greater b value.
 *
 * Assuming compare has the semantics  `b` is a superset of `a`, `inOrder` is checked to be in ascending order or size/containment.
 */
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
	if (Array.isArray(obj)) {
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
