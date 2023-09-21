/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	allowsFieldSuperset,
	allowsTreeSuperset,
	allowsTreeSchemaIdentifierSuperset,
	allowsValueSuperset,
	isNeverField,
	isNeverTree,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../../feature-libraries/modular-schema/comparison";
import {
	FieldStoredSchema,
	TreeStoredSchema,
	ValueSchema,
	TreeTypeSet,
	emptyMap,
	fieldSchema,
	InMemoryStoredSchemaRepository,
	TreeSchemaIdentifier,
	treeSchema,
	storedEmptyFieldSchema,
} from "../../../core";
import { brand } from "../../../util";
import { defaultSchemaPolicy, FieldKinds } from "../../../feature-libraries";
import { namedTreeSchema } from "../../utils";

describe("Schema Comparison", () => {
	/**
	 * FieldStoredSchema permits anything.
	 * Note that children inside the field still have to be in schema.
	 */
	const anyField = fieldSchema(FieldKinds.sequence);

	/**
	 * TreeStoredSchema that permits anything without a value.
	 * Note that children under the fields still have to be in schema.
	 */
	const anyTreeWithoutValue: TreeStoredSchema = {
		structFields: emptyMap,
		mapFields: anyField,
	};

	const numberLeaf: TreeStoredSchema = {
		structFields: emptyMap,
		leafValue: ValueSchema.Number,
	};

	/**
	 * FieldStoredSchema which is impossible for any data to be in schema with.
	 */
	const neverField = fieldSchema(FieldKinds.value, []);

	/**
	 * TreeStoredSchema which is impossible for any data to be in schema with.
	 */
	const neverTree: TreeStoredSchema = {
		structFields: emptyMap,
		mapFields: neverField,
	};

	const neverTree2: TreeStoredSchema = {
		structFields: new Map([[brand("x"), neverField]]),
	};

	const emptyTree = namedTreeSchema({
		name: "empty",
		structFields: {},
	});

	const emptyLocalFieldTree = namedTreeSchema({
		name: "emptyLocalFieldTree",
		structFields: { x: storedEmptyFieldSchema },
	});

	const optionalLocalFieldTree = namedTreeSchema({
		name: "optionalLocalFieldTree",
		structFields: { x: fieldSchema(FieldKinds.optional, [emptyTree.name]) },
	});

	const valueLocalFieldTree = namedTreeSchema({
		name: "valueLocalFieldTree",
		structFields: { x: fieldSchema(FieldKinds.value, [emptyTree.name]) },
	});

	const valueAnyField = fieldSchema(FieldKinds.value);
	const valueEmptyTreeField = fieldSchema(FieldKinds.value, [emptyTree.name]);
	const optionalAnyField = fieldSchema(FieldKinds.optional);
	const optionalEmptyTreeField = fieldSchema(FieldKinds.optional, [emptyTree.name]);

	function updateTreeSchema(
		repo: InMemoryStoredSchemaRepository,
		identifier: TreeSchemaIdentifier,
		schema: TreeStoredSchema,
	) {
		repo.update({
			rootFieldSchema: repo.rootFieldSchema,
			treeSchema: new Map([...repo.treeSchema, [identifier, schema]]),
		});
	}

	it("isNeverField", () => {
		const repo = new InMemoryStoredSchemaRepository();
		assert(isNeverField(defaultSchemaPolicy, repo, neverField));
		updateTreeSchema(repo, brand("never"), neverTree);
		const neverField2: FieldStoredSchema = fieldSchema(FieldKinds.value, [brand("never")]);
		assert(isNeverField(defaultSchemaPolicy, repo, neverField2));
		assert.equal(isNeverField(defaultSchemaPolicy, repo, storedEmptyFieldSchema), false);
		assert.equal(isNeverField(defaultSchemaPolicy, repo, anyField), false);
		assert.equal(isNeverField(defaultSchemaPolicy, repo, valueEmptyTreeField), true);
		updateTreeSchema(repo, brand("empty"), emptyTree);
		assert.equal(
			isNeverField(
				defaultSchemaPolicy,
				repo,
				fieldSchema(FieldKinds.value, [brand("empty")]),
			),
			false,
		);
		assert.equal(isNeverField(defaultSchemaPolicy, repo, valueAnyField), false);
		assert.equal(isNeverField(defaultSchemaPolicy, repo, valueEmptyTreeField), false);
		assert.equal(isNeverField(defaultSchemaPolicy, repo, optionalAnyField), false);
		assert.equal(isNeverField(defaultSchemaPolicy, repo, optionalEmptyTreeField), false);
	});

	it("isNeverTree", () => {
		const repo = new InMemoryStoredSchemaRepository();
		assert(isNeverTree(defaultSchemaPolicy, repo, neverTree));
		assert(
			isNeverTree(defaultSchemaPolicy, repo, {
				structFields: emptyMap,
				mapFields: neverField,
			}),
		);
		assert(isNeverTree(defaultSchemaPolicy, repo, neverTree2));
		assert(isNeverTree(defaultSchemaPolicy, repo, undefined));
		assert.equal(
			isNeverTree(defaultSchemaPolicy, repo, {
				structFields: emptyMap,
			}),
			false,
		);
		assert.equal(isNeverTree(defaultSchemaPolicy, repo, anyTreeWithoutValue), false);

		assert(
			allowsTreeSuperset(
				defaultSchemaPolicy,
				repo,
				repo.treeSchema.get(emptyTree.name),
				emptyTree,
			),
		);
		updateTreeSchema(repo, emptyTree.name, emptyTree);

		assert.equal(isNeverTree(defaultSchemaPolicy, repo, emptyLocalFieldTree), false);
		assert.equal(isNeverTree(defaultSchemaPolicy, repo, valueLocalFieldTree), false);
		assert.equal(isNeverTree(defaultSchemaPolicy, repo, optionalLocalFieldTree), false);
	});

	it("isNeverTreeRecursive", () => {
		const repo = new InMemoryStoredSchemaRepository();
		const recursiveField = fieldSchema(FieldKinds.value, [brand("recursive")]);
		const recursiveType = treeSchema({
			mapFields: recursiveField,
		});
		updateTreeSchema(repo, brand("recursive"), recursiveType);
		assert(isNeverTree(defaultSchemaPolicy, repo, recursiveType));
	});

	it("isNeverTreeRecursive non-never", () => {
		const repo = new InMemoryStoredSchemaRepository();
		const recursiveField = fieldSchema(FieldKinds.value, [brand("recursive"), emptyTree.name]);
		const recursiveType = treeSchema({
			mapFields: recursiveField,
		});
		updateTreeSchema(repo, emptyTree.name, emptyTree);
		updateTreeSchema(repo, brand("recursive"), recursiveType);
		assert(isNeverTree(defaultSchemaPolicy, repo, recursiveType));
	});

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
		testPartialOrder<ValueSchema | undefined>(allowsValueSuperset, [
			ValueSchema.Boolean,
			ValueSchema.Number,
			ValueSchema.String,
			ValueSchema.FluidHandle,
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
		const repo = new InMemoryStoredSchemaRepository();
		updateTreeSchema(repo, brand("never"), neverTree);
		updateTreeSchema(repo, emptyTree.name, emptyTree);
		const neverField2: FieldStoredSchema = fieldSchema(FieldKinds.value, [brand("never")]);
		const compare = (a: FieldStoredSchema, b: FieldStoredSchema): boolean =>
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

	it("allowsTreeSuperset-no leaf values", () => {
		const repo = new InMemoryStoredSchemaRepository();
		updateTreeSchema(repo, emptyTree.name, emptyTree);
		const compare = (
			a: TreeStoredSchema | undefined,
			b: TreeStoredSchema | undefined,
		): boolean => allowsTreeSuperset(defaultSchemaPolicy, repo, a, b);
		testOrder(compare, [neverTree, emptyTree, optionalLocalFieldTree, anyTreeWithoutValue]);
		testPartialOrder(
			compare,
			[
				neverTree,
				neverTree2,
				undefined,
				anyTreeWithoutValue,
				emptyTree,
				emptyLocalFieldTree,
				optionalLocalFieldTree,
				valueLocalFieldTree,
			],
			[
				[neverTree, neverTree2, undefined],
				[emptyTree, emptyLocalFieldTree],
			],
		);
	});

	it("allowsTreeSuperset-leaf values", () => {
		const repo = new InMemoryStoredSchemaRepository();
		updateTreeSchema(repo, emptyTree.name, emptyTree);
		const compare = (
			a: TreeStoredSchema | undefined,
			b: TreeStoredSchema | undefined,
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
				)} to be a superset of ${JSON.stringify(
					intoSimpleObject(inOrder[index]),
				)} but was ${Ordering[order]}`,
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
	if (typeof obj !== "object") {
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
