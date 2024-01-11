/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	MapTree,
	StoredSchemaCollection,
	TreeFieldStoredSchema,
	TreeNodeStoredSchema,
	LeafNodeStoredSchema,
	ObjectNodeStoredSchema,
	MapNodeStoredSchema,
} from "../../core/index.js";
import { FullSchemaPolicy } from "../modular-schema/index.js";
import { Multiplicity } from "../multiplicity.js";
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

export function isFieldInSchema(
	field: MapTree[],
	schema: TreeFieldStoredSchema,
	nodeSchemaCollection: StoredSchemaCollection,
	schemaPolicy: FullSchemaPolicy,
): boolean {
	const multiplicity = schemaPolicy.fieldKinds.get(schema.kind.identifier)?.multiplicity;
	if (multiplicity === undefined || !complyWithMultiplicity(field.length, multiplicity)) {
		return false;
	}

	if (schema.types !== undefined) {
		for (const node of field) {
			if (!schema.types.has(node.type)) {
				return false;
			}
		}
	}

	for (const node of field) {
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

function complyWithMultiplicity(numberOfFields: number, multiplicity: Multiplicity): boolean {
	switch (multiplicity) {
		case Multiplicity.Single:
			return numberOfFields === 1;
		case Multiplicity.Optional:
			return numberOfFields <= 1;
		case Multiplicity.Sequence:
			return true;
		case Multiplicity.Forbidden:
			return numberOfFields === 0;
		default:
			throw new Error(`Unknown multiplicity ${multiplicity}`);
	}
}
