/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type {
	FieldMapObject,
	JsonableTree,
	SharedTreeContentSnapshot,
	TreeNodeStoredSchema,
	TreeTypeSet,
} from "@fluidframework/tree/internal";
import {
	EmptyKey,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
} from "@fluidframework/tree/internal";
import type {
	SharedTreeLeafNode,
	VisualSharedTreeNode,
	SharedTreeSchemaNode,
} from "./VisualSharedTreeTypes.js";
import { VisualSharedTreeNodeKind } from "./VisualSharedTreeTypes.js";
import {
	type VisualChildNode,
	VisualNodeKind,
	type VisualValueNode,
	type VisualTreeNode,
} from "./VisualTree.js";

/**
 * Returns allowed types of the non-leaf nodes in the tree.
 * @param allowedTypes - a string if array node, `Record<string, string>` for non-array nodes.
 * @returns - a VisualChildNode with the allowed type.
 */
function createAllowedTypesVisualTree(
	allowedTypes: string | Record<string, string>,
): VisualChildNode {
	if (typeof allowedTypes === "string") {
		return {
			value: allowedTypes,
			nodeKind: VisualNodeKind.ValueNode,
		};
	}

	const result: Record<string, VisualValueNode> = {};
	for (const [allowedTypeKey, allowedType] of Object.entries(allowedTypes)) {
		result[allowedTypeKey] = {
			nodeKind: VisualNodeKind.ValueNode,
			value: allowedType,
		};
	}

	return {
		children: result,
		nodeKind: VisualNodeKind.TreeNode,
	};
}

/**
 * Creates a visual representation of the schema of the tree in {@link VisualTreeNode} format.
 */
function createToolTipContents(schema: SharedTreeSchemaNode): VisualTreeNode {
	const children: Record<string, VisualChildNode> = {
		name: {
			nodeKind: VisualNodeKind.ValueNode,
			value: schema.schemaName,
		},
	};
	if (schema.allowedTypes !== undefined) {
		children.allowedTypes = createAllowedTypesVisualTree(schema.allowedTypes);
	}
	return {
		nodeKind: VisualNodeKind.TreeNode,
		children,
	};
}

/**
 * Constructs a VisualTree of the input tree's schema fields in {@link VisualTreeNode} or {@link VisualValueNode}.
 */
export function toVisualTree(tree: VisualSharedTreeNode): VisualValueNode | VisualTreeNode {
	if (tree.kind === VisualSharedTreeNodeKind.LeafNode) {
		const result: VisualValueNode = {
			value: tree.value,
			nodeKind: VisualNodeKind.ValueNode,
			tooltipContents: {
				schema: createToolTipContents(tree.schema),
			},
		};
		return result;
	} else {
		const children: Record<string, VisualChildNode> = {};

		for (const [key, value] of Object.entries(tree.fields)) {
			const child = toVisualTree(value);
			children[key] = child;
		}

		return {
			children,
			nodeKind: VisualNodeKind.TreeNode,
			tooltipContents: {
				schema: createToolTipContents(tree.schema),
			},
		};
	}
}

/**
 * Concatenrate allowed types for `ObjectNodeStoredSchema` and `MapNodeStoredSchema`.
 */
function concatenateTypes(fieldKey: string, fieldTypes: TreeTypeSet | undefined): string {
	let fieldAllowedType = fieldKey === EmptyKey ? "" : `${fieldKey} : `;

	if (fieldTypes === undefined) {
		fieldAllowedType += "any";
	} else {
		const allowedTypes = [...fieldTypes].join(" | ");
		fieldAllowedType += `${allowedTypes}`;
	}

	return fieldAllowedType;
}

/**
 * Returns the allowed fields & types for the object fields (e.g., `foo : string | number, bar: boolean`)
 */
function getObjectAllowedTypes(schema: ObjectNodeStoredSchema): string {
	const result: string[] = [];

	for (const [fieldKey, treeFieldStoredSchema] of schema.objectNodeFields) {
		// Set of allowed tree types `TreeTypeSet`.
		const fieldTypes = treeFieldStoredSchema.types;

		result.push(concatenateTypes(fieldKey, fieldTypes));

		// If the field key is `EmptyKey`, then it is an array field.
		// Return the allowed types in string format, instead of JSON format.
		if (fieldKey === EmptyKey) {
			return result.join("");
		}
	}

	return `{ ${result.join(", ")} }`;
}

/**
 * Returns the allowed fields & types for the map fields.
 */
function getMapAllowedTypes(
	fields: FieldMapObject<JsonableTree> | undefined,
	schema: MapNodeStoredSchema,
): string {
	if (fields === undefined) {
		throw new TypeError("Fields should not be undefined.");
	}

	const mapFieldAllowedTypes = schema.mapFields.types;

	const result: string[] = [];

	for (const [fieldKey] of Object.entries(fields)) {
		result.push(concatenateTypes(fieldKey, mapFieldAllowedTypes));
	}

	return `{ ${result.join(", ")} }`;
}

/**
 * Returns the schema & leaf value of the node with type {@link LeafNodeStoredSchema}.
 */
function visualizeLeafNode(tree: JsonableTree): SharedTreeLeafNode {
	return {
		schema: {
			schemaName: tree.type,
		},
		value: JSON.stringify(tree.value), // TODO: Change to VisualizeChildData.
		kind: VisualSharedTreeNodeKind.LeafNode,
	};
}

/**
 * Returns the schema & fields of the node with type {@link ObjectNodeStoredSchema}.
 */
function visualizeObjectNode(
	tree: JsonableTree,
	schema: ObjectNodeStoredSchema,
	contentSnapshot: SharedTreeContentSnapshot,
): VisualSharedTreeNode {
	const treeFields = tree.fields;

	if (treeFields === undefined || Object.keys(treeFields).length === 0) {
		return {
			schema: {
				schemaName: tree.type,
				allowedTypes: getObjectAllowedTypes(schema),
			},
			fields: {},
			kind: VisualSharedTreeNodeKind.InternalNode,
		};
	}

	const fields: Record<string | number, VisualSharedTreeNode> = {};

	// `EmptyKey` indicates an array field (e.g., `schemabuilder.array()`).
	// Hides level of indirection by omitting the empty key in the visual output.
	if (
		Object.keys(treeFields).length === 1 &&
		Object.prototype.hasOwnProperty.call(treeFields, EmptyKey)
	) {
		const children = treeFields[EmptyKey];

		for (let i = 0; i < children.length; i++) {
			const childSchema = contentSnapshot.schema.nodeSchema.get(children[i].type);
			fields[i] = visualizeSharedTreeNodeBySchema(children[i], childSchema, contentSnapshot);
		}
	} else {
		for (const [fieldKey, childField] of Object.entries(treeFields)) {
			const childSchema = contentSnapshot.schema.nodeSchema.get(childField[0].type);

			fields[fieldKey] = visualizeSharedTreeNodeBySchema(
				childField[0],
				childSchema,
				contentSnapshot,
			);
		}
	}

	return {
		schema: {
			schemaName: tree.type,
			allowedTypes: getObjectAllowedTypes(schema),
		},
		fields,
		kind: VisualSharedTreeNodeKind.InternalNode,
	};
}

/**
 * Returns the schema & fields of the node with type {@link MapNodeStoredSchema}.
 */
function visualizeMapNode(
	tree: JsonableTree,
	schema: MapNodeStoredSchema,
	contentSnapshot: SharedTreeContentSnapshot,
): VisualSharedTreeNode {
	const treeFields = tree.fields;

	if (treeFields === undefined || Object.keys(treeFields).length === 0) {
		return {
			schema: {
				schemaName: tree.type,
				allowedTypes: getMapAllowedTypes(treeFields, schema),
			},
			fields: {},
			kind: VisualSharedTreeNodeKind.InternalNode,
		};
	}

	const fields: Record<string | number, VisualSharedTreeNode> = {};

	for (const [fieldKey, childField] of Object.entries(treeFields)) {
		const fieldSchema = contentSnapshot.schema.nodeSchema.get(childField[0].type);

		fields[fieldKey] = visualizeSharedTreeNodeBySchema(
			childField[0],
			fieldSchema,
			contentSnapshot,
		);
	}

	return {
		schema: {
			schemaName: tree.type,
			allowedTypes: getMapAllowedTypes(treeFields, schema),
		},
		fields,
		kind: VisualSharedTreeNodeKind.InternalNode,
	};
}

/**
 * Main recursive helper function to create the visual representation of the SharedTree.
 * Filters tree nodes based on their schema type.
 */
export function visualizeSharedTreeNodeBySchema(
	tree: JsonableTree,
	schema: TreeNodeStoredSchema | undefined,
	contentSnapshot: SharedTreeContentSnapshot,
): VisualSharedTreeNode {
	if (schema instanceof LeafNodeStoredSchema) {
		return visualizeLeafNode(tree);
	} else if (schema instanceof ObjectNodeStoredSchema) {
		return visualizeObjectNode(tree, schema, contentSnapshot);
	} else if (schema instanceof MapNodeStoredSchema) {
		return visualizeMapNode(tree, schema, contentSnapshot);
	} else {
		throw new TypeError("Unrecognized schema type.");
	}
}
