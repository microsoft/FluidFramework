/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	FieldKindIdentifier,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	MutableTreeStoredSchema,
	ObjectNodeStoredSchema,
	TreeFieldStoredSchema,
	TreeNodeSchemaIdentifier,
	TreeNodeStoredSchema,
	TreeStoredSchemaRepository,
	TreeTypeSet,
	ValueSchema,
	storedEmptyFieldSchema,
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
function fieldSchema(
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

	const optionalEmptyTree: TreeNodeStoredSchema = new MapNodeStoredSchema(optionalEmptyTreeField);
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

	/**
	 * This test suite aims to test the ordering relationship between the different repositories
	 * (i.e different combinations of field schemas), it will not primarily focus on the comparison
	 * between field schemas themselves, the tests for `allowsFieldSuperset` and `allowsTreeSuperset`
	 * have done most of the heavy-lifting.
	 *
	 * The primary objective behind designing this test suite is to ensure backward compatibility
	 * during document schema upgrades. When we talk about 'schema evolution', a prerequisite is to
	 * ensure that the upgraded schema can be the superset of the original one.
	 */
	describe("allowsRepoSuperset", () => {
		const compareTwoRepo = (
			a: { name: TreeNodeSchemaIdentifier; schema: TreeNodeStoredSchema }[],
			b: { name: TreeNodeSchemaIdentifier; schema: TreeNodeStoredSchema }[],
		): boolean => {
			const repo1 = new TreeStoredSchemaRepository();
			const repo2 = new TreeStoredSchemaRepository();
			for (const { name, schema } of a) {
				updateTreeSchema(repo1, name, schema);
			}
			for (const { name, schema } of b) {
				updateTreeSchema(repo2, name, schema);
			}
			return allowsRepoSuperset(defaultSchemaPolicy, repo1, repo2);
		};

		const emptyTestTree = {
			name: brand<TreeNodeSchemaIdentifier>("testTree"),
			schema: new ObjectNodeStoredSchema(new Map()),
		};
		const valueTestTree = {
			name: brand<TreeNodeSchemaIdentifier>("testTree"),
			schema: valueAnyTree,
		};
		const valueEmptyTestTree = {
			name: brand<TreeNodeSchemaIdentifier>("testTree"),
			schema: valueEmptyTree,
		};
		const optionalTestTree = {
			name: brand<TreeNodeSchemaIdentifier>("testTree"),
			schema: optionalTreeWithoutValue,
		};
		const optionalEmptyTestTree = {
			name: brand<TreeNodeSchemaIdentifier>("testTree"),
			schema: optionalEmptyTree,
		};
		const anyTestTree = {
			name: brand<TreeNodeSchemaIdentifier>("testTree"),
			schema: anyTreeWithoutValue,
		};

		it("Incorporating additional node schema should result in a superset", () => {
			// When repo B has more fields than repo A (with the remaining fields the same), regardless
			// of whether the additional fields are required or optional, repo B should always be considered
			// the superset of repo A.
			testOrder(compareTwoRepo, [[emptyTree], [emptyTree, optionalLocalFieldTree]]);
			testOrder(compareTwoRepo, [
				[valueLocalFieldTree],
				[valueLocalFieldTree, optionalLocalFieldTree],
			]);
			testOrder(compareTwoRepo, [[emptyTree], [emptyTree, valueLocalFieldTree]]);

			validateOrdering(
				compareTwoRepo,
				[[emptyTree, valueLocalFieldTree], [emptyTree]],
				Ordering.Subset,
			);

			// If repo B's field is a sequence, potentially accommodating more fields than repo A, it should be
			// considered a superset
			testOrder(compareTwoRepo, [[valueTestTree], [optionalTestTree], [anyTestTree]]);
			testOrder(compareTwoRepo, [[valueTestTree, emptyTestTree], [anyTestTree]]);
		});

		it("Repositories with mismatched fields are incomparable.", () => {
			validateOrdering(
				compareTwoRepo,
				[[valueTestTree, emptyTree], [anyTestTree]],
				Ordering.Incomparable,
			);
		});

		it("Relaxing a field should result in a superset", () => {
			testOrder(compareTwoRepo, [
				[valueTestTree],
				[emptyTestTree],
				[optionalTestTree],
				[anyTestTree],
			]);

			testOrder(compareTwoRepo, [[optionalEmptyTestTree], [optionalTestTree]]);
			testOrder(compareTwoRepo, [[valueEmptyTestTree], [optionalTestTree]]);
			testOrder(compareTwoRepo, [[valueTestTree], [optionalEmptyTestTree]]);
		});

		it("Some scenarios in which two repositories are considered equal", () => {
			// When the field schema is `required`, no matter with or without child types, they should be Equal
			validateOrdering(
				compareTwoRepo,
				[[valueTestTree], [valueEmptyTestTree]],
				Ordering.Equal,
			);

			// When the field identifiers are different but the schema is the same, they still should be Equal
			// TODO: should allowsRepoSuperset validates the consistency of identifiers?
			validateOrdering(
				compareTwoRepo,
				[
					[{ name: brand<TreeNodeSchemaIdentifier>("testTree"), schema: neverTree }],
					[{ name: brand<TreeNodeSchemaIdentifier>("testTree2"), schema: neverTree }],
				],
				Ordering.Equal,
			);
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
			throw new Error(
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
 * This function is used to capture the error message and determine the actual ordering of the input components.
 */
function validateOrdering<T>(compare: (a: T, b: T) => boolean, inOrder: T[], expected: Ordering) {
	assert.throws(
		() => {
			testOrder(compare, inOrder);
		},
		(error: Error) => {
			return error !== undefined && extractOrderingFromError(error.message) === expected;
		},
	);
}

function extractOrderingFromError(errorMessage: string): Ordering | undefined {
	const orderingRegex = /but was (Equal|Superset|Subset|Incomparable)/;
	// Check if the error message contains the ordering regex pattern
	const match = errorMessage.match(orderingRegex);
	if (match !== null) {
		switch (match[1]) {
			case "Equal":
				return Ordering.Equal;
			case "Superset":
				return Ordering.Superset;
			case "Subset":
				return Ordering.Subset;
			case "Incomparable":
				return Ordering.Incomparable;
			default:
				break;
		}
	}
	return undefined;
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
