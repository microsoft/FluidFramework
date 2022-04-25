/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-internal-modules */

import { strict as assert } from "assert";

// TODO: what is the pattern for testing packages which have folders inside src?

import {
	allowsFieldSuperset, allowsTreeSuperset, allowsValueSuperset, isNeverField, isNeverTree,
} from "../schema/Comparison";
import {
	FieldSchema,
	GlobalFieldKey,
	LocalFieldKey,
	FieldKind,
	NamedTreeSchema,
	TreeSchema,
	TreeSchemaIdentifier,
	ValueSchema,
} from "../schema/Schema";
import { emptyField, emptyMap, emptySet, fieldSchema } from "../schema/Builders";
import { anyField, anyTree, neverField, neverTree } from "../schema/SpecialSchema";
import { StoredSchemaRepository } from "../schema/StoredSchemaRepository";

describe("Schema", () => {
	const neverTree2: TreeSchema = {
		localFields: new Map([["x" as LocalFieldKey, neverField]]),
		globalFields: emptySet,
		extraLocalFields: emptyField,
		extraGlobalFields: true,
		value: ValueSchema.Serializable,
	};

	const emptyTree: NamedTreeSchema = {
		name: "empty" as TreeSchemaIdentifier,
		localFields: emptyMap,
		globalFields: emptySet,
		extraLocalFields: emptyField,
		extraGlobalFields: false,
		value: ValueSchema.Nothing,
	};

	const emptyLocalFieldTree: NamedTreeSchema = {
		name: "emptyLocalFieldTree" as TreeSchemaIdentifier,
		localFields: new Map([["x" as LocalFieldKey, emptyField]]),
		globalFields: emptySet,
		extraLocalFields: emptyField,
		extraGlobalFields: false,
		value: ValueSchema.Nothing,
	};

	const optionalLocalFieldTree: NamedTreeSchema = {
		name: "optionalLocalFieldTree" as TreeSchemaIdentifier,
		localFields: new Map([["x" as LocalFieldKey, fieldSchema(FieldKind.Optional, [emptyTree.name])]]),
		globalFields: emptySet,
		extraLocalFields: emptyField,
		extraGlobalFields: false,
		value: ValueSchema.Nothing,
	};

	const valueLocalFieldTree: NamedTreeSchema = {
		name: "valueLocalFieldTree" as TreeSchemaIdentifier,
		localFields: new Map([["x" as LocalFieldKey, fieldSchema(FieldKind.Value, [emptyTree.name])]]),
		globalFields: emptySet,
		extraLocalFields: emptyField,
		extraGlobalFields: false,
		value: ValueSchema.Nothing,
	};

	it("isNeverField", () => {
		const repo = new StoredSchemaRepository();
		assert(isNeverField(repo, neverField));
		repo.tryUpdateTreeSchema("never" as TreeSchemaIdentifier, neverTree);
		const neverField2: FieldSchema = {
			kind: FieldKind.Value,
			types: new Set(["never" as TreeSchemaIdentifier]),
		};
		assert(isNeverField(repo, neverField2));
		assert.equal(isNeverField(repo, emptyField), false);
		assert.equal(isNeverField(repo, anyField), false);
		repo.tryUpdateTreeSchema("empty" as TreeSchemaIdentifier, emptyTree);
		assert.equal(isNeverField(repo, {
			kind: FieldKind.Value,
			types: new Set(["empty" as TreeSchemaIdentifier]),
		}), false);
	});

	it("isNeverTree", () => {
		const repo = new StoredSchemaRepository();
		assert(isNeverTree(repo, neverTree));
		assert(isNeverTree(repo, {
			localFields: emptyMap,
			globalFields: emptySet,
			extraLocalFields: neverField,
			extraGlobalFields: false,
			value: ValueSchema.Nothing,
		}));
		assert(isNeverTree(repo, neverTree2));
		repo.tryUpdateFieldSchema("never" as GlobalFieldKey, neverField);
		assert(isNeverTree(repo, {
			localFields: emptyMap,
			globalFields: new Set(["never" as GlobalFieldKey]),
			extraLocalFields: emptyField,
			extraGlobalFields: true,
			value: ValueSchema.Serializable,
		}));
		assert.equal(isNeverTree(repo, {
			localFields: emptyMap,
			globalFields: emptySet,
			extraLocalFields: emptyField,
			extraGlobalFields: false,
			value: ValueSchema.Nothing,
		}), false);
		assert.equal(isNeverTree(repo, anyTree), false);

		assert(repo.tryUpdateTreeSchema(emptyTree.name, emptyTree));

		assert.equal(isNeverTree(repo, emptyLocalFieldTree), false);
		assert.equal(isNeverTree(repo, valueLocalFieldTree), false);
		assert.equal(isNeverTree(repo, optionalLocalFieldTree), false);
	});

	it("allowsValueSuperset", () => {
		testOrder(allowsValueSuperset, [ValueSchema.Boolean, ValueSchema.Serializable]);
		testOrder(allowsValueSuperset, [ValueSchema.Number, ValueSchema.Serializable]);
		testOrder(allowsValueSuperset, [ValueSchema.String, ValueSchema.Serializable]);
		testOrder(allowsValueSuperset, [ValueSchema.Nothing, ValueSchema.Serializable]);
		testPartialOrder<ValueSchema>(
			allowsValueSuperset,
			[ValueSchema.Boolean, ValueSchema.Number, ValueSchema.String,
				ValueSchema.Nothing, ValueSchema.Serializable],
		);
	});

	it("allowsFieldSuperset", () => {
		const repo = new StoredSchemaRepository();
		repo.tryUpdateTreeSchema("never" as TreeSchemaIdentifier, neverTree);
		const neverField2: FieldSchema = {
			kind: FieldKind.Value,
			types: new Set(["never" as TreeSchemaIdentifier]),
		};
		const compare = (a: FieldSchema, b: FieldSchema): boolean => allowsFieldSuperset(repo, a, b);
		testOrder(compare, [neverField, emptyField, anyField]);
		testPartialOrder(compare, [neverField, neverField2, emptyField, anyField], [[neverField, neverField2]]);
	});

	it("allowsTreeSuperset", () => {
		const repo = new StoredSchemaRepository();
		assert(repo.tryUpdateTreeSchema(emptyTree.name, emptyTree));
		const compare = (a: TreeSchema, b: TreeSchema): boolean => allowsTreeSuperset(repo, a, b);
		testOrder(compare, [neverTree, emptyTree, optionalLocalFieldTree, anyTree]);
		testPartialOrder(
			compare,
			[neverTree, neverTree2, anyTree, emptyTree,
				emptyLocalFieldTree, optionalLocalFieldTree, valueLocalFieldTree],
			[[neverTree, neverTree2], [emptyTree, emptyLocalFieldTree]],
		);
	});
});

enum Ordering {
	Subset,
	Equal,
	Incomparable,
	Superset,
}

function getOrdering<T>(original: T, superset: T, allowsSuperset: (a: T, b: T) => boolean): Ordering {
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
		assert.equal(getOrdering(inOrder[index], inOrder[index + 1], compare), Ordering.Superset);
	}
}

/**
 * Tests a comparison function, ensuring it produces a non-strict partial order over the provided values.
 * https://en.wikipedia.org/wiki/Partially_ordered_set#Non-strict_partial_order
 */
function testPartialOrder<T>(
	compare: (a: T, b: T) => boolean, values: T[], expectedEqual: T[][] = []): void {
	// To be a strict partial order, the function must be:
	// Reflexivity: a ≤ a
	// Antisymmetry: if a ≤ b and b ≤ a then a = b
	// Transitivity: if a ≤ b  and  b ≤ c  then  a ≤ c

	// This can is brute forced in O(n^3) time below:
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
			const expectEqual = (a === b) || (expectedEqualMap.get(a)?.has(b) ?? false);
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
		return Array.from(
			obj,
			([key, value]): [unknown, unknown] => [key, intoSimpleObject(value)]);
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
