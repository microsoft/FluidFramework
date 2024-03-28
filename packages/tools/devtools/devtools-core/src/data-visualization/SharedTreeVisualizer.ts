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
	EmptyKey,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
} from "@fluidframework/tree/internal";
import type { SharedTreeLeafNode, VisualSharedTreeNode } from "./VisualSharedTreeTypes.js";
import { type VisualChildNode, VisualNodeKind, type VisualValueNode } from "./VisualTree.js";

/**
 * Converts the output of {@link sharedTreeVisualizer} to {@link VisualChildNode} type containing `schema` and `children` fields.
 */
export function mapToVisualChildNode(tree: VisualSharedTreeNode): VisualChildNode {
	if ("value" in tree) {
		const result: VisualValueNode = {
			value: tree.value,
			nodeKind: VisualNodeKind.ValueNode,
			sharedTreeSchemaData: tree.schema.allowedTypes,
		};
		return result;
	} else {
		// Handling SharedTreeNode
		const children: Record<string, VisualChildNode> = {};

		for (const [key, value] of Object.entries(tree.fields)) {
			const child = mapToVisualChildNode(value);
			children[key] = child;
		}

		return {
			children,
			nodeKind: VisualNodeKind.TreeNode,
			sharedTreeSchemaData: tree.schema.allowedTypes,
		};
	}
}

/**
 * Returns the allowed fields & types for the object fields.
 */
function getObjectAllowedTypes(schema: ObjectNodeStoredSchema): string {
	let result = "";
	const resultObject: Record<string | number, string> = {};

	for (const [fieldKey, treeFieldStoredSchema] of schema.objectNodeFields) {
		/**
		 * Set of allowed tree types {@link TreeTypeSet}.
		 */
		const fieldTypes = treeFieldStoredSchema.types;

		let fieldAllowedType = `${fieldKey} : `;
		let resultObjectValue = "";

		/**
		 * If not specified, types are unconstrained.
		 */
		if (fieldTypes === undefined) {
			fieldAllowedType += "any";
			resultObject[fieldKey] = "any";
		} else {
			for (const type of fieldTypes) {
				fieldAllowedType += `${type} | `;
				resultObjectValue += `${type} | `;
			}
		}

		/**
		 * Slice the trailing ` | ` from the `fieldAllowedType`.
		 */
		fieldAllowedType = `${fieldAllowedType.slice(0, -3)}, `;

		result += fieldAllowedType;
		resultObject[fieldKey] = resultObjectValue;
	}

	/**
	 * Slice the trailing `, ` from the `result`.
	 */
	result = result.slice(0, -2);

	console.log(resultObject);
	return `{ ${result} }`;
}

/**
 * Returns the allowed fields & types for the map fields.
 */
function getMapAllowedTypes(
	fields: FieldMapObject<JsonableTree> | undefined,
	schema: MapNodeStoredSchema,
): string {
	// TODO: Write this function.
	const result = "";
	return result;
}

/**
 * Returns the schema & leaf value of the node with type {@link LeafNodeStoredSchema}.
 */
function visualizeLeafNodeStoredSchema(
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

/**
 * TODO
 */
function visualizeObjectNodeStoredSchema(
	tree: JsonableTree,
	schema: ObjectNodeStoredSchema,
	contentSnapshot: SharedTreeContentSnapshot,
): VisualSharedTreeNode {
	const treeFields = tree.fields;

	if (treeFields === undefined || Object.keys(treeFields).length === 0) {
		return {
			schema: { name: tree.type, allowedTypes: getObjectAllowedTypes(schema) },
			fields: {},
		};
	}

	const fields: Record<string | number, VisualSharedTreeNode> = {};

	/**
	 * {@link EmptyKey} indicates an array field (e.g., `schemabuilder.array()`).
	 * Hides level of indirection by omitting the empty key in the visual output.
	 */
	if (
		Object.keys(treeFields).length === 1 &&
		Object.prototype.hasOwnProperty.call(treeFields, EmptyKey)
	) {
		const children = treeFields[EmptyKey];
		for (let i = 0; i < children.length; i++) {
			const arraySchema = contentSnapshot.schema.nodeSchema.get(children[i].type);
			fields[i] = visualizeSharedTreeNodeBySchema(children[i], arraySchema, contentSnapshot);
		}
	} else {
		for (const [fieldKey, childField] of Object.entries(treeFields)) {
			assert(
				childField.length === 1,
				"Non-array node should not have more than one child field.",
			);
			const fieldSchema = contentSnapshot.schema.nodeSchema.get(childField[0].type);
			fields[fieldKey] = visualizeSharedTreeNodeBySchema(
				childField[0],
				fieldSchema,
				contentSnapshot,
			);
		}
	}

	return {
		schema: { name: tree.type, allowedTypes: getObjectAllowedTypes(schema) },
		fields,
	};
}

/**
 * TODO
 */
function visualizeMapNodeStoredSchema(
	tree: JsonableTree,
	schema: MapNodeStoredSchema,
	contentSnapshot: SharedTreeContentSnapshot,
): VisualSharedTreeNode {
	const treeFields = tree.fields;

	if (treeFields === undefined || Object.keys(treeFields).length === 0) {
		return {
			schema: { name: tree.type, allowedTypes: getMapAllowedTypes(treeFields, schema) },
			fields: {},
		};
	}

	const fields: Record<string | number, VisualSharedTreeNode> = {};

	for (const [fieldKey, childField] of Object.entries(treeFields)) {
		assert(
			childField.length === 1,
			"Non-array node should not have more than one child field.",
		);
		const fieldSchema = contentSnapshot.schema.nodeSchema.get(childField[0].type);
		fields[fieldKey] = visualizeSharedTreeNodeBySchema(
			childField[0],
			fieldSchema,
			contentSnapshot,
		);
	}

	return {
		schema: { name: tree.type, allowedTypes: getMapAllowedTypes(treeFields, schema) }, // TODO: dedupe
		fields,
	};
}

/**
 * Main recursive helper function to create the visual representation of the SharedTree.
 * Filters tree nodes based on their schema type.
 */
export function visualizeSharedTreeNodeBySchema(
	tree: JsonableTree,
	schema: TreeNodeStoredSchema | undefined, // TODO: TreeNodeStoredSchema can be undefined?
	contentSnapshot: SharedTreeContentSnapshot,
): VisualSharedTreeNode {
	if (schema instanceof LeafNodeStoredSchema) {
		return visualizeLeafNodeStoredSchema(tree, schema);
	} else if (schema instanceof ObjectNodeStoredSchema) {
		return visualizeObjectNodeStoredSchema(tree, schema, contentSnapshot);
	} else if (schema instanceof MapNodeStoredSchema) {
		return visualizeMapNodeStoredSchema(tree, schema, contentSnapshot);
	} else {
		throw new TypeError("Unrecognized schema type.");
	}
}
