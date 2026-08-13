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
 * Additional context about a schema validation error.
 * @remarks
 * Not all fields are populated for every error type — only those relevant to the specific error.
 */
export interface SchemaValidationErrorContext {
	/**
	 * The type identifier of the node that failed validation.
	 */
	readonly nodeType?: string;
	/**
	 * The set of type identifiers allowed in the field, if applicable.
	 */
	readonly allowedTypes?: ReadonlySet<string>;
	/**
	 * Field keys on the node that were not recognized by its schema.
	 */
	readonly unexpectedFields?: ReadonlySet<string>;
	/**
	 * The field kind identifier, if the error applies to a field.
	 */
	readonly fieldKind?: string;
	/**
	 * The number of children found in the field, if its multiplicity is invalid.
	 */
	readonly childCount?: number;
	/**
	 * The value schema required by a leaf node.
	 */
	readonly expectedValueSchema?: ValueSchema;
	/**
	 * A description of the runtime type of an invalid node value.
	 */
	readonly actualValueType?: string;
}

/**
 * Throws a UsageError indicating a tree is out of schema.
 */
export function throwOutOfSchema(
	maybeError: SchemaValidationError,
	context?: SchemaValidationErrorContext,
): never {
	throw new UsageError(formatSchemaValidationError(maybeError, context));
}

// Not exported: internal helper used by throwOutOfSchema.
function formatSchemaValidationError(
	error: SchemaValidationError,
	context: SchemaValidationErrorContext | undefined,
): string {
	const nodeDesc =
		context?.nodeType === undefined ? "unknown" : JSON.stringify(context.nodeType);
	const fieldKindDesc =
		context?.fieldKind === undefined ? "unknown" : JSON.stringify(context.fieldKind);
	const childCountDesc = context?.childCount ?? "unknown";
	switch (error) {
		case SchemaValidationError.Field_KindNotInSchemaPolicy: {
			return (
				`Tree does not conform to schema. ` +
				`Field kind ${fieldKindDesc} is not supported by the schema policy.`
			);
		}
		case SchemaValidationError.Field_MissingRequiredChild: {
			return (
				`Tree does not conform to schema. ` +
				`A required field of kind ${fieldKindDesc} must contain exactly one child, but found ${childCountDesc}.`
			);
		}
		case SchemaValidationError.Field_MultipleChildrenNotAllowed: {
			return (
				`Tree does not conform to schema. ` +
				`A field of kind ${fieldKindDesc} allows at most one child, but found ${childCountDesc}.`
			);
		}
		case SchemaValidationError.Field_ChildInForbiddenField: {
			const childNoun = context?.childCount === 1 ? "child" : "children";
			return (
				`Tree does not conform to schema. ` +
				`A forbidden field of kind ${fieldKindDesc} must be empty, but found ${childCountDesc} ${childNoun}.`
			);
		}
		case SchemaValidationError.Field_NodeTypeNotAllowed: {
			const allowedDesc =
				context?.allowedTypes === undefined
					? "unknown"
					: `[${[...context.allowedTypes]
							.sort()
							.map((type) => JSON.stringify(type))
							.join(", ")}]`;
			return (
				`Tree does not conform to schema. ` +
				`A node of type ${nodeDesc} is not allowed in this field. Allowed types: ${allowedDesc}. ` +
				`If using a staged allowed type, the stored schema has not been upgraded to include this type yet. ` +
				`Either upgrade the schema to enable the staged type or avoid inserting content of this type until the schema is upgraded.`
			);
		}
		case SchemaValidationError.LeafNode_InvalidValue: {
			const expectedValueDesc =
				context?.expectedValueSchema === undefined
					? "unknown"
					: `"${ValueSchema[context.expectedValueSchema]}"`;
			const actualValueDesc =
				context?.actualValueType === undefined ? "unknown" : `"${context.actualValueType}"`;
			return (
				`Tree does not conform to schema. ` +
				`Leaf node ${nodeDesc} requires a value matching ${expectedValueDesc}, but found ${actualValueDesc}.`
			);
		}
		case SchemaValidationError.LeafNode_FieldsNotAllowed: {
			const fieldsDesc =
				context?.unexpectedFields === undefined
					? "unknown"
					: `[${[...context.unexpectedFields]
							.sort()
							.map((field) => JSON.stringify(field))
							.join(", ")}]`;
			return (
				`Tree does not conform to schema. ` +
				`Leaf node ${nodeDesc} must not contain fields. Unexpected fields: ${fieldsDesc}.`
			);
		}
		case SchemaValidationError.Node_MissingSchema: {
			return (
				`Tree does not conform to schema. ` +
				`No schema definition was found for node type ${nodeDesc}. ` +
				`Ensure the node's type is included in the schema and that the stored schema has been upgraded if needed.`
			);
		}
		case SchemaValidationError.NonLeafNode_ValueNotAllowed: {
			const actualValueDesc =
				context?.actualValueType === undefined ? "unknown" : `"${context.actualValueType}"`;
			return (
				`Tree does not conform to schema. ` +
				`Non-leaf node ${nodeDesc} must not have a value, but found ${actualValueDesc}.`
			);
		}
		case SchemaValidationError.ObjectNode_FieldNotInSchema: {
			const fieldsDesc =
				context?.unexpectedFields === undefined || context.unexpectedFields.size === 0
					? undefined
					: `[${[...context.unexpectedFields]
							.sort()
							.map((field) => JSON.stringify(field))
							.join(", ")}]`;
			const fieldsPart =
				fieldsDesc === undefined
					? "The node has fields that are not defined in its schema."
					: `Unexpected fields: ${fieldsDesc}.`;
			return (
				`Tree does not conform to schema. ` +
				`A node of type ${nodeDesc} has fields not defined in its schema. ${fieldsPart}`
			);
		}
		default: {
			return unreachableCase(error);
		}
	}
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
	onError: (error: SchemaValidationError, context?: SchemaValidationErrorContext) => T,
): T | undefined {
	// Validate the schema declared by the node exists
	const schema = schemaAndPolicy.schema.nodeSchema.get(node.type);
	if (schema === undefined) {
		return onError(SchemaValidationError.Node_MissingSchema, {
			nodeType: node.type,
		});
	}

	// Validate the node is well formed according to its schema

	if (schema instanceof LeafNodeStoredSchema) {
		if (iterableHasSome(node.fields)) {
			return onError(SchemaValidationError.LeafNode_FieldsNotAllowed, {
				nodeType: node.type,
				unexpectedFields: new Set(mapIterable(node.fields, ([key]) => key)),
			});
		}
		if (!allowsValue(schema.leafValue, node.value)) {
			return onError(SchemaValidationError.LeafNode_InvalidValue, {
				nodeType: node.type,
				expectedValueSchema: schema.leafValue,
				actualValueType: getValueType(node.value),
			});
		}
	} else {
		if (node.value !== undefined) {
			return onError(SchemaValidationError.NonLeafNode_ValueNotAllowed, {
				nodeType: node.type,
				actualValueType: getValueType(node.value),
			});
		}

		if (schema instanceof ObjectNodeStoredSchema) {
			const uncheckedFieldsFromNode = new Set(mapIterable(node.fields, ([key, field]) => key));
			for (const [fieldKey, fieldSchema] of schema.objectNodeFields) {
				const nodeField = node.fields.get(fieldKey) ?? [];
				const fieldInSchemaResult = isFieldInSchema(
					nodeField,
					fieldSchema,
					schemaAndPolicy,
					onError,
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
				return onError(SchemaValidationError.ObjectNode_FieldNotInSchema, {
					nodeType: node.type,
					unexpectedFields: uncheckedFieldsFromNode,
				});
			}
		} else if (schema instanceof MapNodeStoredSchema) {
			for (const [_key, field] of node.fields) {
				const fieldInSchemaResult = isFieldInSchema(
					field,
					schema.mapFields,
					schemaAndPolicy,
					onError,
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
	onError: (error: SchemaValidationError, context?: SchemaValidationErrorContext) => T,
): T | undefined {
	// Validate that the field kind is handled by the schema policy
	const kind = schemaAndPolicy.policy.fieldKinds.get(schema.kind);
	if (kind === undefined) {
		return onError(SchemaValidationError.Field_KindNotInSchemaPolicy, {
			fieldKind: schema.kind,
		});
	}

	// Validate that the field doesn't contain more nodes than its type supports
	{
		const multiplicityCheck = compliesWithMultiplicity(childNodes.length, kind.multiplicity);
		if (multiplicityCheck !== undefined) {
			return onError(multiplicityCheck, {
				fieldKind: schema.kind,
				childCount: childNodes.length,
			});
		}
	}

	for (const node of childNodes) {
		// Validate the type declared by the node is allowed in this field
		if (schema.types !== undefined && !schema.types.has(node.type)) {
			return onError(SchemaValidationError.Field_NodeTypeNotAllowed, {
				nodeType: node.type,
				allowedTypes: schema.types,
			});
		}

		// Validate the node complies with the type it declares to be.
		const nodeInSchemaResult = isNodeInSchema(node, schemaAndPolicy, onError);
		if (nodeInSchemaResult !== undefined) {
			return nodeInSchemaResult;
		}
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
