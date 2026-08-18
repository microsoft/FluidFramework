/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase, fail } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	type TreeFieldStoredSchema,
	LeafNodeStoredSchema,
	ObjectNodeStoredSchema,
	MapNodeStoredSchema,
	Multiplicity,
	type SchemaAndPolicy,
	ValueSchema,
} from "../core/index.js";
import { iterableHasSome, mapIterable } from "../util/index.js";

import type { MapTreeFieldViewGeneric, MinimalMapTreeNodeView } from "./mapTreeCursor.js";
import { allowsValue } from "./valueUtilities.js";

export enum SchemaValidationError {
	Field_KindNotInSchemaPolicy,
	Field_MissingRequiredChild,
	Field_MultipleChildrenNotAllowed,
	Field_ChildInForbiddenField,
	Field_NodeTypeNotAllowed,
	LeafNode_InvalidValue,
	LeafNode_FieldsNotAllowed,
	ObjectNode_FieldNotInSchema,
	NonLeafNode_ValueNotAllowed,
	Node_MissingSchema,
}

/**
 * Information about a schema validation error.
 */
export interface SchemaValidationErrorDetails {
	readonly error: SchemaValidationError;
	readonly description: string;
	readonly path: readonly (string | number)[];
}

/**
 * Throws a UsageError indicating a tree is out of schema.
 */
export function throwOutOfSchema(details: SchemaValidationErrorDetails): never {
	const path = details.path.length === 0 ? "" : ` at path ${JSON.stringify(details.path)}`;
	throw new UsageError(`Tree does not conform to schema${path}. ${details.description}`);
}

function schemaValidationError(
	error: SchemaValidationError,
	description: string,
): SchemaValidationErrorDetails {
	return { error, description, path: [] };
}

function prependPath<T extends NotUndefined>(
	onError: (details: SchemaValidationErrorDetails) => T,
	segment: string | number,
): (details: SchemaValidationErrorDetails) => T {
	return (details) => onError({ ...details, path: [segment, ...details.path] });
}

function getValueType(value: unknown): string {
	return value === null ? "null" : typeof value;
}

type NotUndefined = number | string | boolean | bigint | symbol | object;

/**
 * Deeply checks that the provided node complies with the schema based on its identifier.
 *
 * @param onError - Called with the first error (if any).
 *
 * @returns the return value from `onError` if the node or anything inside of it is out of schema, otherwise `undefined`.
 */
export function isNodeInSchema<T extends NotUndefined>(
	node: MinimalMapTreeNodeView,
	schemaAndPolicy: SchemaAndPolicy,
	onError: (details: SchemaValidationErrorDetails) => T,
): T | undefined {
	// Validate the schema declared by the node exists
	const schema = schemaAndPolicy.schema.nodeSchema.get(node.type);
	if (schema === undefined) {
		return onError(
			schemaValidationError(
				SchemaValidationError.Node_MissingSchema,
				`No schema definition was found for node type ${JSON.stringify(node.type)}. Ensure the node's type is included in the schema and that the stored schema has been upgraded if needed.`,
			),
		);
	}

	// Validate the node is well formed according to its schema

	if (schema instanceof LeafNodeStoredSchema) {
		if (iterableHasSome(node.fields)) {
			const unexpectedFields = [...mapIterable(node.fields, ([key]) => key)].sort();
			return onError(
				schemaValidationError(
					SchemaValidationError.LeafNode_FieldsNotAllowed,
					`Leaf node ${JSON.stringify(node.type)} must not contain fields. Unexpected fields: ${JSON.stringify(unexpectedFields)}.`,
				),
			);
		}
		if (!allowsValue(schema.leafValue, node.value)) {
			return onError(
				schemaValidationError(
					SchemaValidationError.LeafNode_InvalidValue,
					`Leaf node ${JSON.stringify(node.type)} requires a value matching ${JSON.stringify(ValueSchema[schema.leafValue])}, but found ${JSON.stringify(getValueType(node.value))}.`,
				),
			);
		}
	} else {
		if (node.value !== undefined) {
			return onError(
				schemaValidationError(
					SchemaValidationError.NonLeafNode_ValueNotAllowed,
					`Non-leaf node ${JSON.stringify(node.type)} must not have a value, but found ${JSON.stringify(getValueType(node.value))}.`,
				),
			);
		}

		if (schema instanceof ObjectNodeStoredSchema) {
			const uncheckedFieldsFromNode = new Set(mapIterable(node.fields, ([key, field]) => key));
			for (const [fieldKey, fieldSchema] of schema.objectNodeFields) {
				const nodeField = node.fields.get(fieldKey) ?? [];
				const fieldInSchemaResult = isFieldInSchema(
					nodeField,
					fieldSchema,
					schemaAndPolicy,
					prependPath(onError, fieldKey),
				);
				if (fieldInSchemaResult !== undefined) {
					return fieldInSchemaResult;
				}
				uncheckedFieldsFromNode.delete(fieldKey);
			}
			// The node has fields that we did not check as part of looking at every field defined in the node's schema.
			// Since this is testing compatibility with a stored schema (not view schema), "allowUnknownOptionalFields" does not exist at this layer.
			// Code using this with a stored schema derived from a view schema rather than the document can be problematic because it may be missing unknown fields that the actual document has.
			// Other schema evolution features like "staged" allowed types will likely cause similar issues elsewhere in this checker.
			if (uncheckedFieldsFromNode.size > 0) {
				return onError(
					schemaValidationError(
						SchemaValidationError.ObjectNode_FieldNotInSchema,
						`A node of type ${JSON.stringify(node.type)} has fields not defined in its schema. Unexpected fields: ${JSON.stringify([...uncheckedFieldsFromNode].sort())}.`,
					),
				);
			}
		} else if (schema instanceof MapNodeStoredSchema) {
			for (const [key, field] of node.fields) {
				const fieldInSchemaResult = isFieldInSchema(
					field,
					schema.mapFields,
					schemaAndPolicy,
					prependPath(onError, key),
				);
				if (fieldInSchemaResult !== undefined) {
					return fieldInSchemaResult;
				}
			}
		} else {
			fail(0xb0e /* Unknown TreeNodeStoredSchema type */);
		}
	}

	return undefined;
}

/**
 * Deeply checks that the nodes comply with the field schema and included schema.
 *
 * @param onError - Called with the first error (if any).
 *
 * @returns the return value from `onError` if the field or anything inside of it is out of schema, otherwise `undefined`.
 */
export function isFieldInSchema<T extends NotUndefined>(
	childNodes: MapTreeFieldViewGeneric<MinimalMapTreeNodeView>,
	schema: TreeFieldStoredSchema,
	schemaAndPolicy: SchemaAndPolicy,
	onError: (details: SchemaValidationErrorDetails) => T,
): T | undefined {
	// Validate that the field kind is handled by the schema policy
	const kind = schemaAndPolicy.policy.fieldKinds.get(schema.kind);
	if (kind === undefined) {
		return onError(
			schemaValidationError(
				SchemaValidationError.Field_KindNotInSchemaPolicy,
				`Field kind ${JSON.stringify(schema.kind)} is not supported by the schema policy.`,
			),
		);
	}

	// Validate that the field doesn't contain more nodes than its type supports
	{
		const multiplicityCheck = compliesWithMultiplicity(childNodes.length, kind.multiplicity);
		if (multiplicityCheck !== undefined) {
			const description =
				multiplicityCheck === SchemaValidationError.Field_MissingRequiredChild
					? `A required field of kind ${JSON.stringify(schema.kind)} must contain exactly one child, but found ${childNodes.length}.`
					: multiplicityCheck === SchemaValidationError.Field_MultipleChildrenNotAllowed
						? `A field of kind ${JSON.stringify(schema.kind)} allows at most one child, but found ${childNodes.length}.`
						: `A forbidden field of kind ${JSON.stringify(schema.kind)} must be empty, but found ${childNodes.length} ${childNodes.length === 1 ? "child" : "children"}.`;
			return onError(schemaValidationError(multiplicityCheck, description));
		}
	}

	let index = 0;
	for (const node of childNodes) {
		// Validate the type declared by the node is allowed in this field
		if (schema.types !== undefined && !schema.types.has(node.type)) {
			const allowedTypes = [...schema.types].sort();
			return prependPath(
				onError,
				index,
			)(
				schemaValidationError(
					SchemaValidationError.Field_NodeTypeNotAllowed,
					`A node of type ${JSON.stringify(node.type)} is not allowed in this field. Allowed types: ${JSON.stringify(allowedTypes)}. If using a staged allowed type, the stored schema has not been upgraded to include this type yet. Either upgrade the schema to enable the staged type or avoid inserting content of this type until the schema is upgraded.`,
				),
			);
		}

		// Validate the node complies with the type it declares to be.
		const nodeInSchemaResult = isNodeInSchema(
			node,
			schemaAndPolicy,
			prependPath(onError, index),
		);
		if (nodeInSchemaResult !== undefined) {
			return nodeInSchemaResult;
		}
		index += 1;
	}

	return undefined;
}

/**
 * Validates that a given number of items complies with the specified {@link Multiplicity | multiplicity}.
 * @param numberOfItems - Number of items.
 * @param multiplicity - Kind of multiplicity to validate against.
 * @returns `true` if the specified number of items complies with the specified multiplicity; otherwise, `false`.
 */
export function compliesWithMultiplicity(
	numberOfItems: number,
	multiplicity: Multiplicity,
): SchemaValidationError | undefined {
	switch (multiplicity) {
		case Multiplicity.Single: {
			if (numberOfItems < 1) {
				return SchemaValidationError.Field_MissingRequiredChild;
			} else if (numberOfItems > 1) {
				return SchemaValidationError.Field_MultipleChildrenNotAllowed;
			} else {
				return undefined;
			}
		}
		case Multiplicity.Optional: {
			return numberOfItems > 1
				? SchemaValidationError.Field_MultipleChildrenNotAllowed
				: undefined;
		}
		case Multiplicity.Sequence: {
			return undefined;
		}
		case Multiplicity.Forbidden: {
			return numberOfItems === 0
				? undefined
				: SchemaValidationError.Field_ChildInForbiddenField;
		}
		default: {
			unreachableCase(multiplicity);
		}
	}
}
