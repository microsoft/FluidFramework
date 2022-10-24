/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaDataAndPolicy } from "../../../schema-stored";
import { FieldKey, genericTreeKeys, getGenericTreeField, JsonableTree } from "../../../tree";
import { fail, brand } from "../../../util";
import {
    UnwrappedEditableField,
    EditableTreeOrPrimitive,
    isPrimitiveValue,
    proxyTargetSymbol,
    valueSymbol,
    getTypeSymbol,
    Multiplicity,
    EditableField,
    EditableTree,
} from "../../../feature-libraries";
import {
    getPrimaryField,
    getFieldKind,
    getFieldSchema,
    isPrimitive,
    // eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/editable-tree/utilities";
// eslint-disable-next-line import/no-internal-modules
import { isArrayField } from "../../../feature-libraries/editable-tree/editableTree";
import { schemaMap } from "./mockData";

/**
 * This helper function traverses the tree using field keys and expects
 * fields to be unwrapped according to {@link UnwrappedEditableField} documentation.
 */
export function expectTreeEquals(
    schemaData: SchemaDataAndPolicy,
    inputField: UnwrappedEditableField,
    expected: JsonableTree,
): void {
    assert(inputField !== undefined);
    const expectedType = schemaMap.get(expected.type) ?? fail("missing type");
    const primary = getPrimaryField(expectedType);
    if (primary !== undefined) {
        assert(isArrayField(inputField));
        // Handle inlined primary fields
        const expectedNodes = expected.fields?.[primary.key];
        if (expectedNodes === undefined) {
            assert.equal(inputField.length, 0);
            return;
        }
        expectTreeSequence(schemaData, inputField, expectedNodes);
        return;
    }
    // Above assert fails to narrow type to exclude readonly arrays, so cast manually here:
    const node = inputField as EditableTreeOrPrimitive;
    if (isPrimitiveValue(node)) {
        // UnwrappedEditableTree loses type information (and any children),
        // so this is really all we can compare:
        assert.equal(node, expected.value);
        return;
    }
    // Confirm we have an EditableTree object.
    assert(node[proxyTargetSymbol] !== undefined);
    assert.equal(node[valueSymbol], expected.value);
    const type = node[getTypeSymbol](undefined, false);
    assert.deepEqual(type, expectedType);
    const expectedFields = new Set(genericTreeKeys(expected));
    for (const ok of Reflect.ownKeys(node)) {
        const key: FieldKey = brand(ok);
        assert(expectedFields.delete(key));
        const subNode = node[key];
        const expectedField = getGenericTreeField(expected, key, false);
        const isSequence =
            getFieldKind(getFieldSchema(brand(key), schemaData, type)).multiplicity ===
            Multiplicity.Sequence;
        // implicit sequence
        if (isSequence) {
            expectTreeSequence(schemaData, subNode, expectedField);
        } else {
            assert.equal(expectedField.length, 1);
            expectTreeEquals(schemaData, subNode, expectedField[0]);
        }
    }
    assert(expectedFields.size === 0);
}

/**
 * This helper function checks sequence fields as arrays,
 * where every element might be unwrapped on not.
 */
export function expectTreeSequence(
    schemaData: SchemaDataAndPolicy,
    field: UnwrappedEditableField,
    expected: JsonableTree[],
): void {
    assert(isArrayField(field));
    assert(Array.isArray(expected));
    assert.equal(field.length, expected.length);
    for (let index = 0; index < field.length; index++) {
        expectTreeEquals(schemaData, field[index], expected[index]);
    }
}

/**
 * This helper function checks the field as {@link EditableField},
 * where every node is a "non-unwrapped" EditableTree.
 * Sequence fields and non-sequence fields having one node or none
 * are handled in the same way.
 */
export function expectFieldEquals(
    schemaData: SchemaDataAndPolicy,
    field: EditableField,
    expected: JsonableTree[],
): void {
    const [fieldSchema, , nodes] = field;
    assert(Array.isArray(expected));
    assert(isArrayField(nodes));
    assert.equal(nodes.length, expected.length);
    const fieldKind = getFieldKind(fieldSchema);
    if (fieldKind.multiplicity !== Multiplicity.Sequence) {
        assert(nodes.length <= 1);
    }
    for (let i = 0; i < nodes.length; i++) {
        expectNodeEquals(schemaData, nodes[i], expected[i]);
    }
}

/**
 * This helper function traverses the tree by iterating over its fields
 * and expecting them to be "non-unwrapped" EditableTrees.
 */
export function expectNodeEquals(
    schemaData: SchemaDataAndPolicy,
    node: EditableTree,
    expected: JsonableTree,
): void {
    assert.equal(expected.type, node[getTypeSymbol]());
    assert.equal(expected.value, node[valueSymbol]);
    const nodeSchema = schemaData.treeSchema.get(expected.type) ?? fail("type");
    assert.deepEqual(nodeSchema, node[getTypeSymbol](undefined, false));
    if (isPrimitiveValue(expected.value)) {
        assert(isPrimitive(nodeSchema));
        assert.deepEqual([...node], []);
        return;
    }
    const expectedFields = new Set(genericTreeKeys(expected));
    for (const field of node) {
        const [, key] = field;
        assert(expectedFields.delete(key));
        const expectedField = getGenericTreeField(expected, key, false);
        expectFieldEquals(schemaData, field, expectedField);
    }
    assert(expectedFields.size === 0);
}
