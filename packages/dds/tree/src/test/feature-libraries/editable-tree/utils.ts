/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaDataAndPolicy } from "../../../schema-stored";
import { FieldKey, isGlobalFieldKey, JsonableTree, keyFromSymbol } from "../../../tree";
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
    isEditableField,
} from "../../../feature-libraries";
import {
    getPrimaryField,
    getFieldKind,
    getFieldSchema,
    isPrimitive,
    // eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/editable-tree/utilities";
import { schemaMap } from "./mockData";

export function expectTreeEquals(
    schemaData: SchemaDataAndPolicy,
    inputField: UnwrappedEditableField,
    expected: JsonableTree,
): void {
    assert(inputField !== undefined);
    const expectedType = schemaMap.get(expected.type) ?? fail("missing type");
    const primary = getPrimaryField(expectedType);
    if (primary !== undefined) {
        assert(Array.isArray(inputField));
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
    for (const key of Object.keys(node)) {
        const subNode = node[key as FieldKey];
        assert(!isEditableField(subNode));
        assert(subNode !== undefined, key);
        const fields = expected.fields ?? {};
        assert.equal(key in fields, true);
        const field: JsonableTree[] = fields[key];
        const isSequence =
            getFieldKind(getFieldSchema(brand(key), schemaData, type)).multiplicity ===
            Multiplicity.Sequence;
        // implicit sequence
        if (isSequence) {
            expectTreeSequence(schemaData, subNode, field);
        } else {
            assert.equal(field.length, 1);
            expectTreeEquals(schemaData, subNode, field[0]);
        }
    }
}

export function expectTreeSequence(
    schemaData: SchemaDataAndPolicy,
    field: UnwrappedEditableField,
    expected: JsonableTree[],
): void {
    assert(Array.isArray(field));
    assert(Array.isArray(expected));
    assert.equal(field.length, expected.length);
    for (let index = 0; index < field.length; index++) {
        expectTreeEquals(schemaData, field[index], expected[index]);
    }
}

export function expectFieldEquals(
    schemaData: SchemaDataAndPolicy,
    field: EditableField,
    expected: JsonableTree[],
): void {
    // this is not required, only for testing
    assert(isEditableField(field));
    const [fieldSchema, , nodes] = field;
    assert(Array.isArray(expected));
    assert(Array.isArray(nodes));
    assert.equal(nodes.length, expected.length);
    const fieldKind = getFieldKind(fieldSchema);
    if (fieldKind.multiplicity !== Multiplicity.Sequence) {
        assert(nodes.length <= 1);
    }
    for (let i = 0; i < nodes.length; i++) {
        expectNodeEquals(schemaData, nodes[i], expected[i]);
    }
}

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
    for (const field of node) {
        const [, childKey] = field;
        const expectedGlobalFields = expected.globalFields ?? {};
        const expectedFields = expected.fields ?? {};
        let expectedField: JsonableTree[];
        if (isGlobalFieldKey(childKey)) {
            assert(childKey in expectedGlobalFields);
            expectedField = expectedGlobalFields[keyFromSymbol(childKey)];
        } else {
            assert(childKey in expectedFields);
            expectedField = expectedFields[childKey];
        }
        expectFieldEquals(schemaData, field, expectedField);
    }
}
