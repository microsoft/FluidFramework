/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import {
	MapTree,
	StoredSchemaCollection,
	TreeFieldStoredSchema,
	TreeNodeStoredSchema,
	LeafNodeStoredSchema,
	ObjectNodeStoredSchema,
	MapNodeStoredSchema,
	Multiplicity,
} from "../../core/index.js";
import { FullSchemaPolicy } from "../modular-schema/index.js";
import { allowsValue } from "../valueUtilities.js";

export function isNodeInSchema(
	node: MapTree,
	schema: TreeNodeStoredSchema,
	nodeSchemaCollection: StoredSchemaCollection,
	schemaPolicy: FullSchemaPolicy,
): boolean {
	if (
		schema instanceof LeafNodeStoredSchema &&
		(node.value === undefined ||
			node.fields.size !== 0 ||
			!allowsValue(schema.leafValue, node.value))
	) {
		return false;
	}

	if (schema instanceof ObjectNodeStoredSchema) {
		if (node.fields.size !== schema.objectNodeFields.size) {
			return false;
		}
		for (const [fieldKey, field] of node.fields) {
			const fieldSchema = schema.objectNodeFields.get(fieldKey);
			if (
				fieldSchema === undefined ||
				!isFieldInSchema(field, fieldSchema, nodeSchemaCollection, schemaPolicy)
			) {
				return false;
			}
		}
	}

	if (schema instanceof MapNodeStoredSchema) {
		for (const field of node.fields.values()) {
			if (!isFieldInSchema(field, schema.mapFields, nodeSchemaCollection, schemaPolicy)) {
				return false;
			}
		}
	}

	return true;
}

// function export function isNodeUnionInSchema(
// 	node: MapTree,
// 	allowedTypes: TreeTypeSet,
// 	nodeSchemaCollection: StoredSchemaCollection,
// 	schemaPolicy: FullSchemaPolicy,
// ): boolean {
// }

export function isFieldInSchema(
	childNodes: MapTree[],
	schema: TreeFieldStoredSchema,
	nodeSchemaCollection: StoredSchemaCollection,
	schemaPolicy: FullSchemaPolicy,
): boolean {
	// Validate that the field kind is handled by the schema policy
	const kind = schemaPolicy.fieldKinds.get(schema.kind);
	if (kind === undefined) {
		return false;
	}

	// Validate that the field doesn't contain more nodes than its type supports
	if (!compliesWithMultiplicity(childNodes.length, kind.multiplicity)) {
		return false;
	}

	for (const node of childNodes) {
		// Validate the type declared by the node is allowed in this field
		if (schema.types !== undefined && !schema.types.has(node.type)) {
			return false;
		}

		// Validate the node complies with the type it declares to be.
		const nodeSchema = nodeSchemaCollection.nodeSchema.get(node.type);
		if (
			nodeSchema === undefined ||
			!isNodeInSchema(node, nodeSchema, nodeSchemaCollection, schemaPolicy)
		) {
			return false;
		}
	}

	return true;
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
