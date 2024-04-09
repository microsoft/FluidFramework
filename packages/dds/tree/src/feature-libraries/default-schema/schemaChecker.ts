/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import {
	MapTree,
	StoredSchemaCollection,
	TreeFieldStoredSchema,
	LeafNodeStoredSchema,
	ObjectNodeStoredSchema,
	MapNodeStoredSchema,
	Multiplicity,
} from "../../core/index.js";
import { FullSchemaPolicy } from "../modular-schema/index.js";
import { allowsValue } from "../valueUtilities.js";

export const enum SchemaValidationErrors {
	NoError,
	Field_KindNotInSchemaPolicy,
	Field_IncorrectMultiplicity,
	Field_NodeTypeNotAllowed,
	LeafNode_MissingValue,
	LeafNode_InvalidValue,
	LeafNode_FieldsNotAllowed,
	ObjectNode_FieldCountMismatch,
	ObjectNode_FieldNotInSchema,
	Node_MissingSchema,
	UnknownError,
}

export function isNodeInSchema(
	node: MapTree,
	nodeSchemaCollection: StoredSchemaCollection,
	schemaPolicy: FullSchemaPolicy,
): SchemaValidationErrors {
	// Validate the schema declared by the node exists
	const schema = nodeSchemaCollection.nodeSchema.get(node.type);
	if (schema === undefined) {
		return SchemaValidationErrors.Node_MissingSchema;
	}

	// Validate the node is well formed according to its schema

	if (schema instanceof LeafNodeStoredSchema) {
		if (node.value === undefined) {
			return SchemaValidationErrors.LeafNode_MissingValue;
		}
		if (node.fields.size !== 0) {
			return SchemaValidationErrors.LeafNode_FieldsNotAllowed;
		}
		if (!allowsValue(schema.leafValue, node.value)) {
			return SchemaValidationErrors.LeafNode_InvalidValue;
		}
	}

	if (schema instanceof ObjectNodeStoredSchema) {
		if (node.fields.size !== schema.objectNodeFields.size) {
			return SchemaValidationErrors.ObjectNode_FieldCountMismatch;
		}
		for (const [fieldKey, field] of node.fields) {
			const fieldSchema = schema.objectNodeFields.get(fieldKey);
			if (fieldSchema === undefined) {
				return SchemaValidationErrors.ObjectNode_FieldNotInSchema;
			}
			const fieldInSchemaResult = isFieldInSchema(
				field,
				fieldSchema,
				nodeSchemaCollection,
				schemaPolicy,
			);
			if (fieldInSchemaResult !== SchemaValidationErrors.NoError) {
				return fieldInSchemaResult;
			}
		}
	}

	if (schema instanceof MapNodeStoredSchema) {
		for (const field of node.fields.values()) {
			const fieldInSchemaResult = isFieldInSchema(
				field,
				schema.mapFields,
				nodeSchemaCollection,
				schemaPolicy,
			);
			if (fieldInSchemaResult !== SchemaValidationErrors.NoError) {
				return fieldInSchemaResult;
			}
		}
	}

	return SchemaValidationErrors.NoError;
}

export function isFieldInSchema(
	childNodes: MapTree[],
	schema: TreeFieldStoredSchema,
	nodeSchemaCollection: StoredSchemaCollection,
	schemaPolicy: FullSchemaPolicy,
): SchemaValidationErrors {
	// Validate that the field kind is handled by the schema policy
	const kind = schemaPolicy.fieldKinds.get(schema.kind);
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
		const nodeInSchemaResult = isNodeInSchema(
			node,
			nodeSchemaCollection,
			schemaPolicy,
		);
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
