/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	appendDebugMessage,
	unreachableCase,
	fail,
} from "@fluidframework/core-utils/internal";
import type {
	ITelemetryBaseProperties,
	TelemetryBaseEventPropertyType,
} from "@fluidframework/core-interfaces";
import {
	tagCodeArtifacts,
	tagData,
	tagSchemaArtifacts,
	TelemetryDataTag,
	UsageError,
} from "@fluidframework/telemetry-utils/internal";

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
	readonly path: readonly (string | number)[];
	readonly telemetryProperties?: ITelemetryBaseProperties;
}

/**
 * Throws a UsageError indicating a tree is out of schema.
 */
export function throwOutOfSchema(details: SchemaValidationErrorDetails): never {
	const message = `Tree does not conform to schema. ${getSchemaValidationErrorMessage(details.error)}`;
	throw new UsageError(
		appendDebugMessage(message, () => getSchemaValidationDebugMessage(details)),
		{
			...tagCodeArtifacts({
				schemaValidationError: SchemaValidationError[details.error],
			}),
			...tagData(TelemetryDataTag.UserData, {
				schemaValidationPath: JSON.stringify(details.path),
			}),
			...details.telemetryProperties,
		},
	);
}

function getTelemetryProperty(
	details: SchemaValidationErrorDetails,
	key: string,
): TelemetryBaseEventPropertyType {
	const property = details.telemetryProperties?.[key];
	return typeof property === "object" ? property.value : property;
}

function getSchemaValidationDebugMessage(details: SchemaValidationErrorDetails): string {
	const path = details.path.length === 0 ? "" : ` at path ${JSON.stringify(details.path)}`;
	const nodeType = getTelemetryProperty(details, "nodeType");
	const fieldKind = getTelemetryProperty(details, "fieldKind");
	const childCount = getTelemetryProperty(details, "childCount");
	switch (details.error) {
		case SchemaValidationError.Field_KindNotInSchemaPolicy: {
			return `Field kind ${JSON.stringify(fieldKind)} is not supported by the schema policy${path}.`;
		}
		case SchemaValidationError.Field_MissingRequiredChild: {
			return `A required field of kind ${JSON.stringify(fieldKind)} must contain exactly one child, but found ${childCount}${path}.`;
		}
		case SchemaValidationError.Field_MultipleChildrenNotAllowed: {
			return `A field of kind ${JSON.stringify(fieldKind)} allows at most one child, but found ${childCount}${path}.`;
		}
		case SchemaValidationError.Field_ChildInForbiddenField: {
			return `A forbidden field of kind ${JSON.stringify(fieldKind)} must be empty, but found ${childCount} ${childCount === 1 ? "child" : "children"}${path}.`;
		}
		case SchemaValidationError.Field_NodeTypeNotAllowed: {
			return `A node of type ${JSON.stringify(nodeType)} is not allowed in this field${path}. Allowed types: ${getTelemetryProperty(details, "allowedTypes")}. If using a staged allowed type, upgrade the stored schema before inserting this content.`;
		}
		case SchemaValidationError.LeafNode_InvalidValue: {
			return `Leaf node ${JSON.stringify(nodeType)} requires a value matching ${JSON.stringify(getTelemetryProperty(details, "expectedValueType"))}, but found ${JSON.stringify(getTelemetryProperty(details, "actualValueType"))}${path}.`;
		}
		case SchemaValidationError.LeafNode_FieldsNotAllowed: {
			return `Leaf node ${JSON.stringify(nodeType)} must not contain fields${path}. Unexpected fields: ${getTelemetryProperty(details, "unexpectedFields")}.`;
		}
		case SchemaValidationError.ObjectNode_FieldNotInSchema: {
			return `A node of type ${JSON.stringify(nodeType)} has fields not defined in its schema${path}. Unexpected fields: ${getTelemetryProperty(details, "unexpectedFields")}.`;
		}
		case SchemaValidationError.NonLeafNode_ValueNotAllowed: {
			return `Non-leaf node ${JSON.stringify(nodeType)} must not have a value, but found ${JSON.stringify(getTelemetryProperty(details, "actualValueType"))}${path}.`;
		}
		case SchemaValidationError.Node_MissingSchema: {
			return `No schema definition was found for node type ${JSON.stringify(nodeType)}${path}. Ensure the node's type is included in the schema and that the stored schema has been upgraded if needed.`;
		}
		default: {
			return unreachableCase(details.error);
		}
	}
}

function getSchemaValidationErrorMessage(error: SchemaValidationError): string {
	switch (error) {
		case SchemaValidationError.Field_KindNotInSchemaPolicy: {
			return "The field kind is not supported by the schema policy.";
		}
		case SchemaValidationError.Field_MissingRequiredChild: {
			return "A required field is missing its child.";
		}
		case SchemaValidationError.Field_MultipleChildrenNotAllowed: {
			return "A field contains more children than its kind allows.";
		}
		case SchemaValidationError.Field_ChildInForbiddenField: {
			return "A forbidden field contains children.";
		}
		case SchemaValidationError.Field_NodeTypeNotAllowed: {
			return "A node type is not allowed in its field.";
		}
		case SchemaValidationError.LeafNode_InvalidValue: {
			return "A leaf node value does not match its schema.";
		}
		case SchemaValidationError.LeafNode_FieldsNotAllowed: {
			return "A leaf node contains fields.";
		}
		case SchemaValidationError.ObjectNode_FieldNotInSchema: {
			return "An object node contains fields not defined in its schema.";
		}
		case SchemaValidationError.NonLeafNode_ValueNotAllowed: {
			return "A non-leaf node contains a value.";
		}
		case SchemaValidationError.Node_MissingSchema: {
			return "The node type has no schema definition.";
		}
		default: {
			return unreachableCase(error);
		}
	}
}

function schemaValidationError(
	error: SchemaValidationError,
	telemetryProperties?: ITelemetryBaseProperties,
): SchemaValidationErrorDetails {
	return { error, path: [], telemetryProperties };
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
				tagSchemaArtifacts({ nodeType: node.type }),
			),
		);
	}

	// Validate the node is well formed according to its schema

	if (schema instanceof LeafNodeStoredSchema) {
		if (iterableHasSome(node.fields)) {
			const unexpectedFields = [...mapIterable(node.fields, ([key]) => key)].sort();
			return onError(
				schemaValidationError(SchemaValidationError.LeafNode_FieldsNotAllowed, {
					...tagSchemaArtifacts({ nodeType: node.type }),
					...tagData(TelemetryDataTag.UserData, {
						unexpectedFields: JSON.stringify(unexpectedFields),
					}),
				}),
			);
		}
		if (!allowsValue(schema.leafValue, node.value)) {
			return onError(
				schemaValidationError(SchemaValidationError.LeafNode_InvalidValue, {
					...tagSchemaArtifacts({
						nodeType: node.type,
						expectedValueType: ValueSchema[schema.leafValue],
					}),
					actualValueType: getValueType(node.value),
				}),
			);
		}
	} else {
		if (node.value !== undefined) {
			return onError(
				schemaValidationError(SchemaValidationError.NonLeafNode_ValueNotAllowed, {
					...tagSchemaArtifacts({ nodeType: node.type }),
					actualValueType: getValueType(node.value),
				}),
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
					schemaValidationError(SchemaValidationError.ObjectNode_FieldNotInSchema, {
						...tagSchemaArtifacts({ nodeType: node.type }),
						...tagData(TelemetryDataTag.UserData, {
							unexpectedFields: JSON.stringify([...uncheckedFieldsFromNode].sort()),
						}),
					}),
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
				tagSchemaArtifacts({ fieldKind: schema.kind }),
			),
		);
	}

	// Validate that the field doesn't contain more nodes than its type supports
	{
		const multiplicityCheck = compliesWithMultiplicity(childNodes.length, kind.multiplicity);
		if (multiplicityCheck !== undefined) {
			return onError(
				schemaValidationError(multiplicityCheck, {
					...tagSchemaArtifacts({ fieldKind: schema.kind }),
					childCount: childNodes.length,
				}),
			);
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
					tagSchemaArtifacts({
						nodeType: node.type,
						allowedTypes: JSON.stringify(allowedTypes),
					}),
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
