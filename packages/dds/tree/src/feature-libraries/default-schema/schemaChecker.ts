/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import {
	type MapTree,
	type TreeFieldStoredSchema,
	LeafNodeStoredSchema,
	ObjectNodeStoredSchema,
	MapNodeStoredSchema,
	Multiplicity,
	type SchemaAndPolicy,
} from "../../core/index.js";
import { allowsValue } from "../valueUtilities.js";
import { fail } from "../../util/index.js";

export const enum SchemaValidationErrors {
	NoError,
	Field_KindNotInSchemaPolicy,
	Field_IncorrectMultiplicity,
	Field_NodeTypeNotAllowed,
	LeafNode_InvalidValue,
	LeafNode_FieldsNotAllowed,
	ObjectNode_FieldNotInSchema,
	NonLeafNode_ValueNotAllowed,
	Node_MissingSchema,
	UnknownError,
}

/**
 * Deeply checks that the provided node complies with the schema based on its identifier.
 */
export function isNodeInSchema(
	node: MapTree,
	schemaAndPolicy: SchemaAndPolicy,
): SchemaValidationErrors {
	// If the stored schema is completely empty it _probably_ (in almost all cases?) means the tree is brand new and we
	// shouldn't validate the data.
	// TODO: AB#8197
	// See https://github.com/microsoft/FluidFramework/pull/21305#discussion_r1626595991 for further discussion.
	if (schemaAndPolicy.schema.nodeSchema.size === 0) {
		return SchemaValidationErrors.NoError;
	}

	// Validate the schema declared by the node exists
	const schema = schemaAndPolicy.schema.nodeSchema.get(node.type);
	if (schema === undefined) {
		return SchemaValidationErrors.Node_MissingSchema;
	}

	// Validate the node is well formed according to its schema

	if (schema instanceof LeafNodeStoredSchema) {
		if (node.fields.size !== 0) {
			return SchemaValidationErrors.LeafNode_FieldsNotAllowed;
		}
		if (!allowsValue(schema.leafValue, node.value)) {
			return SchemaValidationErrors.LeafNode_InvalidValue;
		}
	} else if (schema instanceof ObjectNodeStoredSchema) {
		if (node.value !== undefined) {
			return SchemaValidationErrors.NonLeafNode_ValueNotAllowed;
		}
		const uncheckedFieldsFromNode = new Set(node.fields.keys());
		for (const [fieldKey, fieldSchema] of schema.objectNodeFields) {
			const nodeField = node.fields.get(fieldKey) ?? [];
			const fieldInSchemaResult = isFieldInSchema(nodeField, fieldSchema, schemaAndPolicy);
			if (fieldInSchemaResult !== SchemaValidationErrors.NoError) {
				return fieldInSchemaResult;
			}
			uncheckedFieldsFromNode.delete(fieldKey);
		}
		// The node has fields that we did not check as part of looking at every field defined in the node's schema
		if (
			uncheckedFieldsFromNode.size !== 0 &&
			!schemaAndPolicy.policy.allowUnknownOptionalFields(node.type)
		) {
			return SchemaValidationErrors.ObjectNode_FieldNotInSchema;
		}
	} else if (schema instanceof MapNodeStoredSchema) {
		if (node.value !== undefined) {
			return SchemaValidationErrors.NonLeafNode_ValueNotAllowed;
		}
		for (const field of node.fields.values()) {
			const fieldInSchemaResult = isFieldInSchema(field, schema.mapFields, schemaAndPolicy);
			if (fieldInSchemaResult !== SchemaValidationErrors.NoError) {
				return fieldInSchemaResult;
			}
		}
	} else {
		fail("Unknown TreeNodeStoredSchema type");
	}

	return SchemaValidationErrors.NoError;
}

/**
 * Deeply checks that the nodes comply with the field schema and included schema.
 */
export function isFieldInSchema(
	childNodes: readonly MapTree[],
	schema: TreeFieldStoredSchema,
	schemaAndPolicy: SchemaAndPolicy,
): SchemaValidationErrors {
	// Validate that the field kind is handled by the schema policy
	const kind = schemaAndPolicy.policy.fieldKinds.get(schema.kind);
	if (kind === undefined) {
		return SchemaValidationErrors.Field_KindNotInSchemaPolicy;
	}

	// Validate that the field doesn't contain more nodes than its type supports
	if (!compliesWithMultiplicity(childNodes.length, kind.multiplicity)) {
		return SchemaValidationErrors.Field_IncorrectMultiplicity;
	}

	for (const node of childNodes) {
		// Validate the type declared by the node is allowed in this field
		if (schema.types !== undefined && !schema.types.has(node.type)) {
			return SchemaValidationErrors.Field_NodeTypeNotAllowed;
		}

		// Validate the node complies with the type it declares to be.
		const nodeInSchemaResult = isNodeInSchema(node, schemaAndPolicy);
		if (nodeInSchemaResult !== SchemaValidationErrors.NoError) {
			return nodeInSchemaResult;
		}
	}

	return SchemaValidationErrors.NoError;
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
): boolean {
	switch (multiplicity) {
		case Multiplicity.Single:
			return numberOfItems === 1;
		case Multiplicity.Optional:
			return numberOfItems <= 1;
		case Multiplicity.Sequence:
			return true;
		case Multiplicity.Forbidden:
			return numberOfItems === 0;
		default:
			unreachableCase(multiplicity);
	}
}
