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

import type { VisualizeChildData } from "./DataVisualization.js";
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
	type FluidHandleNode,
	type UnknownObjectNode,
} from "./VisualTree.js";

/**
 * Returns VisualNodeKind that is compatible to {@link FluidObjectNode} based on the `visualTree`'s node kind.
 */
export function determineNodeKind(nodeKind: VisualNodeKind): VisualNodeKind {
	switch (nodeKind) {
		case VisualNodeKind.TreeNode:
		case VisualNodeKind.FluidHandleNode: {
			return VisualNodeKind.FluidTreeNode;
		}
		case VisualNodeKind.ValueNode: {
			return VisualNodeKind.FluidValueNode;
		}
		default: {
			return VisualNodeKind.FluidUnknownObjectNode;
		}
	}
}

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
 * Converts the visual representation from {@link visualizeSharedTreeNodeBySchema} to a visual tree compatible with the devtools-view.
 * @param tree - the visual representation of the SharedTree.
 * @returns - the visual representation of type {@link VisualChildNode}
 */
export function toVisualTree(tree: VisualSharedTreeNode): VisualChildNode {
	if (tree.kind === VisualSharedTreeNodeKind.LeafNode) {
		switch (tree.value.nodeKind) {
			case VisualNodeKind.ValueNode: {
				const result: VisualValueNode = {
					value: tree.value.value,
					nodeKind: VisualNodeKind.ValueNode,
					tooltipContents: {
						schema: createToolTipContents(tree.schema),
					},
				};
				return result;
			}
			case VisualNodeKind.FluidHandleNode: {
				const result: FluidHandleNode = {
					fluidObjectId: tree.value.fluidObjectId,
					nodeKind: VisualNodeKind.FluidHandleNode,
					tooltipContents: {
						schema: createToolTipContents(tree.schema),
					},
				};
				return result;
			}
			default: {
				console.error(`Unknown node kind: ${tree.value.nodeKind}`);
				const result: UnknownObjectNode = {
					nodeKind: VisualNodeKind.UnknownObjectNode,
					tooltipContents: {
						schema: createToolTipContents(tree.schema),
					},
				};
				return result;
			}
		}
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
async function visualizeLeafNode(
	tree: JsonableTree,
	visualizeChildData: VisualizeChildData,
): Promise<SharedTreeLeafNode> {
	return {
		schema: {
			schemaName: tree.type,
		},
		value: await visualizeChildData(tree.value),
		kind: VisualSharedTreeNodeKind.LeafNode,
	};
}

/**
 * Returns the schema & fields of the node with type {@link ObjectNodeStoredSchema}.
 */
async function visualizeObjectNode(
	tree: JsonableTree,
	schema: ObjectNodeStoredSchema,
	contentSnapshot: SharedTreeContentSnapshot,
	visualizeChildData: VisualizeChildData,
): Promise<VisualSharedTreeNode> {
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
			fields[i] = await visualizeSharedTreeNodeBySchema(
				children[i],
				childSchema,
				contentSnapshot,
				visualizeChildData,
			);
		}
	} else {
		for (const [fieldKey, childField] of Object.entries(treeFields)) {
			const childSchema = contentSnapshot.schema.nodeSchema.get(childField[0].type);

			fields[fieldKey] = await visualizeSharedTreeNodeBySchema(
				childField[0],
				childSchema,
				contentSnapshot,
				visualizeChildData,
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
async function visualizeMapNode(
	tree: JsonableTree,
	schema: MapNodeStoredSchema,
	contentSnapshot: SharedTreeContentSnapshot,
	visualizeChildData: VisualizeChildData,
): Promise<VisualSharedTreeNode> {
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

		fields[fieldKey] = await visualizeSharedTreeNodeBySchema(
			childField[0],
			fieldSchema,
			contentSnapshot,
			visualizeChildData,
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
 * Processes tree nodes based on their schema type (e.g., ObjectNodeStoredSchema, MapNodeStoredSchema, LeafNodeStoredSchema), producing the visual representation for each type.
 *
 * @see {@link https://fluidframework.com/docs/data-structures/tree/} for more information on the SharedTree schema.
 *
 * @remarks
 */
export async function visualizeSharedTreeNodeBySchema(
	tree: JsonableTree,
	schema: TreeNodeStoredSchema | undefined,
	contentSnapshot: SharedTreeContentSnapshot,
	visualizeChildData: VisualizeChildData,
): Promise<VisualSharedTreeNode> {
	if (schema instanceof LeafNodeStoredSchema) {
		const leafVisualized = await visualizeLeafNode(tree, visualizeChildData);
		return leafVisualized;
	} else if (schema instanceof ObjectNodeStoredSchema) {
		const objectVisualized = visualizeObjectNode(
			tree,
			schema,
			contentSnapshot,
			visualizeChildData,
		);
		return objectVisualized;
	} else if (schema instanceof MapNodeStoredSchema) {
		const mapVisualized = visualizeMapNode(tree, schema, contentSnapshot, visualizeChildData);
		return mapVisualized;
	} else {
		throw new TypeError("Unrecognized schema type.");
	}
}
