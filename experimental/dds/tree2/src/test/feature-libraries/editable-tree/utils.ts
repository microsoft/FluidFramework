/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import {
	FieldKey,
	genericTreeKeys,
	getGenericTreeField,
	JsonableTree,
	SchemaData,
} from "../../../core";
import { fail, brand } from "../../../util";
import {
	UnwrappedEditableField,
	EditableTreeOrPrimitive,
	isPrimitiveValue,
	valueSymbol,
	typeSymbol,
	typeNameSymbol,
	Multiplicity,
	EditableField,
	EditableTree,
	isEditableField,
	isPrimitive,
	getField,
	isEditableTree,
	getPrimaryField,
	getFieldKind,
	getFieldSchema,
	parentField,
} from "../../../feature-libraries";

/**
 * This helper function traverses the tree using field keys and expects
 * fields to be unwrapped according to {@link UnwrappedEditableField} documentation.
 */
export function expectTreeEquals(
	schemaData: SchemaData,
	inputField: UnwrappedEditableField,
	expected: JsonableTree,
): void {
	assert(inputField !== undefined);
	const expectedType = schemaData.treeSchema.get(expected.type) ?? fail("missing field");
	const primary = getPrimaryField(expectedType);
	if (primary !== undefined) {
		assert(isEditableField(inputField));
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
	assert(isEditableTree(node));
	assert.equal(node[valueSymbol], expected.value);
	const type = node[typeSymbol];
	assert.deepEqual(type, expectedType);
	const expectedFields = new Set(genericTreeKeys(expected));
	for (const ok of Reflect.ownKeys(node)) {
		assert(typeof ok === "string");
		const key: FieldKey = brand(ok);
		assert(expectedFields.delete(key));
		const subNode = node[key];
		const expectedField = getGenericTreeField(expected, key, false);
		const isSequence =
			getFieldKind(getFieldSchema(brand(key), type)).multiplicity === Multiplicity.Sequence;
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
	schemaData: SchemaData,
	field: UnwrappedEditableField,
	expected: JsonableTree[],
): void {
	assert(isEditableField(field));
	assert(Array.isArray(expected));
	assert.equal(field.length, expected.length);
	for (let index = 0; index < field.length; index++) {
		expectTreeEquals(schemaData, field[index] as UnwrappedEditableField, expected[index]);
	}
}

/**
 * This helper function checks the field as {@link EditableField},
 * where every node is a "non-unwrapped" EditableTree.
 * Sequence fields and non-sequence fields having one node or none
 * are handled in the same way.
 */
export function expectFieldEquals(
	schemaData: SchemaData,
	field: EditableField,
	expected: JsonableTree[],
): void {
	assert(Array.isArray(expected));
	assert.equal(field.length, expected.length);
	const fieldKind = getFieldKind(field.fieldSchema);
	if (fieldKind.multiplicity !== Multiplicity.Sequence) {
		assert(field.length <= 1);
	}
	if (field.length === 0) {
		assert.throws(
			() => field.getNode(0),
			(e: Error) =>
				validateAssertionError(
					e,
					"A child node must exist at index to get it without unwrapping.",
				),
			"Expected exception was not thrown",
		);
	}
	for (let index = 0; index < field.length; index++) {
		const node = field.getNode(index);
		assert.equal(node[parentField].index, index);
		// EditableFields currently don't have stable object identity, so we can't just compare the fields here,
		// and calling `expectFieldEquals` could recurse infinitely, but we can sanity check something from it.
		assert.equal(node[parentField].parent.fieldKey, field.fieldKey);
		expectNodeEquals(schemaData, node, expected[index]);
	}
}

/**
 * This helper function traverses the tree by iterating over its fields
 * and expecting them to be "non-unwrapped" EditableTrees.
 */
export function expectNodeEquals(
	schemaData: SchemaData,
	node: EditableTree,
	expected: JsonableTree,
): void {
	assert.equal(expected.type, node[typeNameSymbol]);
	assert.equal(expected.value, node[valueSymbol]);
	const nodeSchema = schemaData.treeSchema.get(expected.type) ?? fail("type");
	assert.deepEqual(nodeSchema, node[typeSymbol]);
	if (isPrimitiveValue(expected.value)) {
		assert(isPrimitive(nodeSchema));
		assert.deepEqual([...node], []);
		return;
	}
	const expectedFields = new Set(genericTreeKeys(expected));
	for (const field of node) {
		assert(expectedFields.delete(field.fieldKey));
		const expectedField = getGenericTreeField(expected, field.fieldKey, false);
		expectFieldEquals(schemaData, field, expectedField);
		const fieldByKey = node[getField](field.fieldKey);
		expectFieldEquals(schemaData, fieldByKey, expectedField);
	}
	assert(expectedFields.size === 0);
}
