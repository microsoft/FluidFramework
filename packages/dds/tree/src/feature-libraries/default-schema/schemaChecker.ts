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
} from "../../core/index.js";
import { allowsValue } from "../valueUtilities.js";
import type { MapTreeFieldViewGeneric, MinimalMapTreeNodeView } from "../mapTreeCursor.js";

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
 * Throws a UsageError if maybeError indicates a tree is out of schema.
 */
export function inSchemaOrThrow(maybeError: SchemaValidationError | undefined): void {
	if (maybeError !== undefined) {
		throw new UsageError(
			`Tree does not conform to schema: ${SchemaValidationError[maybeError]}`,
		);
	}
}

/**
 * Deeply checks that the provided node complies with the schema based on its identifier.
 */
export function isNodeInSchema(
	node: MinimalMapTreeNodeView,
	schemaAndPolicy: SchemaAndPolicy,
): SchemaValidationError | undefined {
	// Validate the schema declared by the node exists
	const schema = schemaAndPolicy.schema.nodeSchema.get(node.type);
	if (schema === undefined) {
		return SchemaValidationError.Node_MissingSchema;
	}

	// Validate the node is well formed according to its schema

	if (schema instanceof LeafNodeStoredSchema) {
		if (node.fields.size !== 0) {
			return SchemaValidationError.LeafNode_FieldsNotAllowed;
		}
		if (!allowsValue(schema.leafValue, node.value)) {
			return SchemaValidationError.LeafNode_InvalidValue;
		}
	} else {
		if (node.value !== undefined) {
			return SchemaValidationError.NonLeafNode_ValueNotAllowed;
		}

		if (schema instanceof ObjectNodeStoredSchema) {
			const uncheckedFieldsFromNode = new Set(node.fields.keys());
			for (const [fieldKey, fieldSchema] of schema.objectNodeFields) {
				const nodeField = node.fields.get(fieldKey) ?? [];
				const fieldInSchemaResult = isFieldInSchema(nodeField, fieldSchema, schemaAndPolicy);
				if (fieldInSchemaResult !== undefined) {
					return fieldInSchemaResult;
				}
				uncheckedFieldsFromNode.delete(fieldKey);
			}
			// The node has fields that we did not check as part of looking at every field defined in the node's schema
			if (
				uncheckedFieldsFromNode.size !== 0 &&
				!schemaAndPolicy.policy.allowUnknownOptionalFields(node.type)
			) {
				return SchemaValidationError.ObjectNode_FieldNotInSchema;
			}
		} else if (schema instanceof MapNodeStoredSchema) {
			for (const [_key, field] of node.fields) {
				const fieldInSchemaResult = isFieldInSchema(field, schema.mapFields, schemaAndPolicy);
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
 */
export function isFieldInSchema(
	childNodes: MapTreeFieldViewGeneric<MinimalMapTreeNodeView>,
	schema: TreeFieldStoredSchema,
	schemaAndPolicy: SchemaAndPolicy,
): SchemaValidationError | undefined {
	// Validate that the field kind is handled by the schema policy
	const kind = schemaAndPolicy.policy.fieldKinds.get(schema.kind);
	if (kind === undefined) {
		return SchemaValidationError.Field_KindNotInSchemaPolicy;
	}

	// Validate that the field doesn't contain more nodes than its type supports
	{
		const multiplicityCheck = compliesWithMultiplicity(childNodes.length, kind.multiplicity);
		if (multiplicityCheck !== undefined) {
			return multiplicityCheck;
		}
	}

	for (const node of childNodes) {
		// Validate the type declared by the node is allowed in this field
		if (schema.types !== undefined && !schema.types.has(node.type)) {
			return SchemaValidationError.Field_NodeTypeNotAllowed;
		}

		// Validate the node complies with the type it declares to be.
		const nodeInSchemaResult = isNodeInSchema(node, schemaAndPolicy);
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
		case Multiplicity.Single:
			if (numberOfItems < 1) {
				return SchemaValidationError.Field_MissingRequiredChild;
			} else if (numberOfItems > 1) {
				return SchemaValidationError.Field_MultipleChildrenNotAllowed;
			} else {
				return undefined;
			}
		case Multiplicity.Optional:
			return numberOfItems > 1
				? SchemaValidationError.Field_MultipleChildrenNotAllowed
				: undefined;
		case Multiplicity.Sequence:
			return undefined;
		case Multiplicity.Forbidden:
			return numberOfItems === 0
				? undefined
				: SchemaValidationError.Field_ChildInForbiddenField;
		default:
			unreachableCase(multiplicity);
	}
}
