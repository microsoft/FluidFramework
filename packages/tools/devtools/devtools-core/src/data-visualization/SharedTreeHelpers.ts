/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import type {
	FieldMapObject,
	JsonableTree,
	SharedTreeContentSnapshot,
	TreeNodeStoredSchema,
} from "@fluidframework/tree/internal";
import {
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
} from "@fluidframework/tree/internal";
import type { SharedTreeLeafNode, VisualSharedTreeNode } from "./VisualSharedTreeTypes.js";
import { type VisualChildNode, VisualNodeKind, type VisualValueNode } from "./VisualTree.js";

/**
 * TODO
 */
export function visualRepresentationMapper(tree: VisualSharedTreeNode): VisualChildNode {
	if ("value" in tree) {
		const result: VisualValueNode = {
			value: tree.value,
			nodeKind: VisualNodeKind.ValueNode,
			metadata: { allowedTypes: tree.schema.allowedTypes },
		};
		return result;
	} else {
		// Handling SharedTreeNode
		const children: Record<string, VisualChildNode> = {};

		for (const [key, value] of Object.entries(tree.fields)) {
			const child = visualRepresentationMapper(value);
			children[key] = child;
		}

		return {
			children,
			nodeKind: VisualNodeKind.TreeNode,
			metadata: { allowedTypes: tree.schema.allowedTypes },
		};
	}
}

/**
 * Helper function to generate the allowed fields & types for the fields of the tree.
 */
function allowedTypesHelper(schema: ObjectNodeStoredSchema): string {
	let result = "";

	for (const [fieldKey, treeFieldStoredSchema] of schema.objectNodeFields) {
		/**
		 * Set of allowed tree types {@link TreeTypeSet}.
		 */
		const fieldTypes = treeFieldStoredSchema.types;

		let fieldAllowedType = `${fieldKey} : `;

		/**
		 * If not specified, types are unconstrained.
		 */
		if (fieldTypes === undefined) {
			fieldAllowedType += "any";
		} else {
			for (const type of fieldTypes) {
				fieldAllowedType += `${type} | `;
			}
		}

		/**
		 * Slice the trailing ` | ` from the `fieldAllowedType`.
		 */
		fieldAllowedType = `${fieldAllowedType.slice(0, -3)}, `;

		result += fieldAllowedType;
	}

	/**
	 * Slice the trailing `, ` from the `result`.
	 */
	result = result.slice(0, -2);

	return `{ ${result} }`;
}

function allowedTypesMapHelper(
	fields: FieldMapObject<JsonableTree> | undefined,
	schema: MapNodeStoredSchema,
): string {
	// TODO: Write this function.
	const result = "";
	return result;
}

function leafNodeStoredSchemaHelper(
	tree: JsonableTree,
	schema: LeafNodeStoredSchema,
): SharedTreeLeafNode {
	return {
		schema: {
			allowedTypes: JSON.stringify(schema.leafValue),
		},
		value: JSON.stringify(tree.value), // TODO: this needs to be `await visualizeChildData(tree.value), otherwise we won't handle Fluid Handles correctly
	};
}

function objectNodeStoredSchemaHelper(
	tree: JsonableTree,
	schema: ObjectNodeStoredSchema,
	contentSnapshot: SharedTreeContentSnapshot,
): VisualSharedTreeNode {
	const treeFields = tree.fields;

	if (treeFields === undefined || Object.keys(treeFields).length === 0) {
		// TODO: what does this case mean?
		return {
			schema: { name: tree.type, allowedTypes: allowedTypesHelper(schema) },
			fields: {},
		};
	}

	const fields: Record<string | number, VisualSharedTreeNode> = {};

	if (
		Object.keys(treeFields).length === 1 &&
		Object.prototype.hasOwnProperty.call(treeFields, "")
	) {
		const children = treeFields[""]; // TODO: Fail otherwise.
		for (let i = 0; i < children.length; i++) {
			const arraySchema = contentSnapshot.schema.nodeSchema.get(children[i].type);
			fields[i] = sharedTreeVisualizer(children[i], arraySchema, contentSnapshot);
		}
	} else {
		for (const [fieldKey, childField] of Object.entries(treeFields)) {
			assert(
				childField.length === 1,
				"Non-array schema should not have more than one child field.",
			); // TODO: Change.
			const fieldSchema = contentSnapshot.schema.nodeSchema.get(childField[0].type);
			fields[fieldKey] = sharedTreeVisualizer(childField[0], fieldSchema, contentSnapshot);
		}
	}

	return {
		schema: { name: tree.type, allowedTypes: allowedTypesHelper(schema) }, // TODO: dedupe
		fields,
	};
}

function mapNodeStoredSchemaHelper(
	tree: JsonableTree,
	schema: MapNodeStoredSchema,
	contentSnapshot: SharedTreeContentSnapshot,
): VisualSharedTreeNode {
	const treeFields = tree.fields;

	if (treeFields === undefined || Object.keys(treeFields).length === 0) {
		// TODO: what does this case mean?
		return {
			schema: { name: tree.type, allowedTypes: allowedTypesMapHelper(treeFields, schema) },
			fields: {},
		};
	}

	const fields: Record<string | number, VisualSharedTreeNode> = {};

	for (const [fieldKey, childField] of Object.entries(treeFields)) {
		assert(
			childField.length === 1,
			"Non-array schema should not have more than one child field.",
		); // TODO: Change.
		const fieldSchema = contentSnapshot.schema.nodeSchema.get(childField[0].type);
		fields[fieldKey] = sharedTreeVisualizer(childField[0], fieldSchema, contentSnapshot);
	}

	return {
		schema: { name: tree.type, allowedTypes: allowedTypesMapHelper(treeFields, schema) }, // TODO: dedupe
		fields,
	};
}

/**
 * Main recursive helper function to create the visual representation of the SharedTree.
 * Filters tree nodes based on their schema type.
 */
export function sharedTreeVisualizer(
	tree: JsonableTree,
	schema: TreeNodeStoredSchema | undefined, // TODO: TreeNodeStoredSchema can be undefined?
	contentSnapshot: SharedTreeContentSnapshot,
): VisualSharedTreeNode {
	if (schema instanceof LeafNodeStoredSchema) {
		return leafNodeStoredSchemaHelper(tree, schema);
	} else if (schema instanceof ObjectNodeStoredSchema) {
		return objectNodeStoredSchemaHelper(tree, schema, contentSnapshot);
	} else if (schema instanceof MapNodeStoredSchema) {
		return mapNodeStoredSchemaHelper(tree, schema, contentSnapshot);
	} else {
		throw new TypeError("Unrecognized schema type.");
	}
}
