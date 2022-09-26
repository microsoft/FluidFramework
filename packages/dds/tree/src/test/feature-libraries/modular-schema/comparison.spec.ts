/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
    allowsFieldSuperset, allowsTreeSuperset, allowsTreeSchemaIdentifierSuperset,
    allowsValueSuperset, isNeverField, isNeverTree,
// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
} from "../../../feature-libraries/modular-schema/comparison";
import {
    FieldSchema,
    NamedTreeSchema,
    TreeSchema,
    ValueSchema,
    TreeTypeSet,
    emptyMap, emptySet, fieldSchema, StoredSchemaRepository,
} from "../../../schema-stored";
import { brand } from "../../../util";
import { defaultSchemaPolicy, emptyField, FieldKinds, neverField, neverTree } from "../../../feature-libraries";

describe("Schema Comparison", () => {
    /**
     * FieldSchema permits anything.
     * Note that children inside the field still have to be in schema.
     */
    const anyField = fieldSchema(FieldKinds.sequence);

    /**
     * TreeSchema that permits anything.
     * Note that children under the fields (and global fields) still have to be in schema.
     */
    const anyTree: TreeSchema = {
        localFields: emptyMap,
        globalFields: emptySet,
        extraLocalFields: anyField,
        extraGlobalFields: true,
        value: ValueSchema.Serializable,
    };

    const neverTree2: TreeSchema = {
        localFields: new Map([[brand("x"), neverField]]),
        globalFields: emptySet,
        extraLocalFields: emptyField,
        extraGlobalFields: true,
        value: ValueSchema.Serializable,
    };

    const emptyTree: NamedTreeSchema = {
        name: brand("empty"),
        localFields: emptyMap,
        globalFields: emptySet,
        extraLocalFields: emptyField,
        extraGlobalFields: false,
        value: ValueSchema.Nothing,
    };

    const emptyLocalFieldTree: NamedTreeSchema = {
        name: brand("emptyLocalFieldTree"),
        localFields: new Map([[brand("x"), emptyField]]),
        globalFields: emptySet,
        extraLocalFields: emptyField,
        extraGlobalFields: false,
        value: ValueSchema.Nothing,
    };

    const optionalLocalFieldTree: NamedTreeSchema = {
        name: brand("optionalLocalFieldTree"),
        localFields: new Map([[brand("x"), fieldSchema(FieldKinds.optional, [emptyTree.name])]]),
        globalFields: emptySet,
        extraLocalFields: emptyField,
        extraGlobalFields: false,
        value: ValueSchema.Nothing,
    };

    const valueLocalFieldTree: NamedTreeSchema = {
        name: brand("valueLocalFieldTree"),
        localFields: new Map([[brand("x"), fieldSchema(FieldKinds.value, [emptyTree.name])]]),
        globalFields: emptySet,
        extraLocalFields: emptyField,
        extraGlobalFields: false,
        value: ValueSchema.Nothing,
    };

    const valueAnyField = fieldSchema(FieldKinds.value);
    const valueEmptyTreeField = fieldSchema(FieldKinds.value, [emptyTree.name]);
    const optionalAnyField = fieldSchema(FieldKinds.optional);
    const optionalEmptyTreeField = fieldSchema(FieldKinds.optional, [emptyTree.name]);

    it("isNeverField", () => {
        const repo = new StoredSchemaRepository(defaultSchemaPolicy);
        assert(isNeverField(defaultSchemaPolicy, repo, neverField));
        repo.updateTreeSchema(brand("never"), neverTree);
        const neverField2: FieldSchema = fieldSchema(
            FieldKinds.value,
            [brand("never")],
        );
        assert(isNeverField(defaultSchemaPolicy, repo, neverField2));
        assert.equal(isNeverField(defaultSchemaPolicy, repo, emptyField), false);
        assert.equal(isNeverField(defaultSchemaPolicy, repo, anyField), false);
        assert.equal(isNeverField(defaultSchemaPolicy, repo, valueEmptyTreeField), true);
        repo.updateTreeSchema(brand("empty"), emptyTree);
        assert.equal(isNeverField(defaultSchemaPolicy, repo, fieldSchema(FieldKinds.value, [brand("empty")])), false);
        assert.equal(isNeverField(defaultSchemaPolicy, repo, valueAnyField), false);
        assert.equal(isNeverField(defaultSchemaPolicy, repo, valueEmptyTreeField), false);
        assert.equal(isNeverField(defaultSchemaPolicy, repo, optionalAnyField), false);
        assert.equal(isNeverField(defaultSchemaPolicy, repo, optionalEmptyTreeField), false);
    });

    it("isNeverTree", () => {
        const repo = new StoredSchemaRepository(defaultSchemaPolicy);
        assert(isNeverTree(defaultSchemaPolicy, repo, neverTree));
        assert(isNeverTree(defaultSchemaPolicy, repo, {
            localFields: emptyMap,
            globalFields: emptySet,
            extraLocalFields: neverField,
            extraGlobalFields: false,
            value: ValueSchema.Nothing,
        }));
        assert(isNeverTree(defaultSchemaPolicy, repo, neverTree2));
        repo.updateFieldSchema(brand("never"), neverField);
        assert(isNeverTree(defaultSchemaPolicy, repo, {
            localFields: emptyMap,
            globalFields: new Set([brand("never")]),
            extraLocalFields: emptyField,
            extraGlobalFields: true,
            value: ValueSchema.Serializable,
        }));
        assert.equal(isNeverTree(defaultSchemaPolicy, repo, {
            localFields: emptyMap,
            globalFields: emptySet,
            extraLocalFields: emptyField,
            extraGlobalFields: false,
            value: ValueSchema.Nothing,
        }), false);
        assert.equal(isNeverTree(defaultSchemaPolicy, repo, anyTree), false);

        assert(allowsTreeSuperset(defaultSchemaPolicy, repo, repo.lookupTreeSchema(emptyTree.name), emptyTree));
        repo.updateTreeSchema(emptyTree.name, emptyTree);

        assert.equal(isNeverTree(defaultSchemaPolicy, repo, emptyLocalFieldTree), false);
        assert.equal(isNeverTree(defaultSchemaPolicy, repo, valueLocalFieldTree), false);
        assert.equal(isNeverTree(defaultSchemaPolicy, repo, optionalLocalFieldTree), false);
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

    it("allowsTypesSuperset", () => {
        testOrder(
            allowsTreeSchemaIdentifierSuperset,
            [new Set(), new Set([brand("1")]), new Set([brand("1"), brand("2")]), undefined],
        );
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
        const repo = new StoredSchemaRepository(defaultSchemaPolicy);
        repo.updateTreeSchema(brand("never"), neverTree);
        repo.updateTreeSchema(emptyTree.name, emptyTree);
        const neverField2: FieldSchema = fieldSchema(
            FieldKinds.value,
            [brand("never")],
        );
        const compare = (a: FieldSchema, b: FieldSchema): boolean =>
            allowsFieldSuperset(defaultSchemaPolicy, repo, a, b);
        testOrder(compare, [neverField, emptyField, optionalEmptyTreeField, optionalAnyField, anyField]);
        testOrder(compare, [neverField, valueEmptyTreeField, valueAnyField, anyField]);
        assert.equal(getOrdering(valueEmptyTreeField, emptyField, compare), Ordering.Incomparable);
        testPartialOrder(compare, [
            neverField, neverField2, emptyField, anyField,
            valueEmptyTreeField, valueAnyField, valueEmptyTreeField, valueAnyField,
        ], [[neverField, neverField2]]);
    });

    it("allowsTreeSuperset", () => {
        const repo = new StoredSchemaRepository(defaultSchemaPolicy);
        repo.updateTreeSchema(emptyTree.name, emptyTree);
        const compare = (a: TreeSchema, b: TreeSchema): boolean => allowsTreeSuperset(defaultSchemaPolicy, repo, a, b);
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
        const order = getOrdering(inOrder[index], inOrder[index + 1], compare);
        if (order !== Ordering.Superset) {
            assert.fail(
                `expected ${
                    JSON.stringify(intoSimpleObject(inOrder[index + 1]))} to be a superset of ${
                    JSON.stringify(intoSimpleObject(inOrder[index]))} but was ${Ordering[order]}`,
            );
        }
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
