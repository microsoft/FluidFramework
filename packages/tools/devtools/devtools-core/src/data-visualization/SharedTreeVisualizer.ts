/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils";
import type {
	FieldMapObject,
	JsonableTree,
	SharedTreeContentSnapshot,
	TreeFieldStoredSchema,
	TreeNodeStoredSchema,
} from "@fluidframework/tree/internal";
import {
	EmptyKey,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
} from "@fluidframework/tree/internal";
import type { SharedTreeLeafNode, VisualSharedTreeNode } from "./VisualSharedTreeTypes.js";
import { SharedTreeSchemaType, VisualSharedTreeNodeKind } from "./VisualSharedTreeTypes.js";
import { type VisualChildNode, VisualNodeKind, type VisualValueNode } from "./VisualTree.js";

/**
 * Converts the output of {@link sharedTreeVisualizer} to {@link VisualChildNode} type containing `schema` and `children` fields.
 */
export function toVisualTree(tree: VisualSharedTreeNode): VisualChildNode {
	if (tree.kind === VisualSharedTreeNodeKind.LeafNode) {
		const result: VisualValueNode = {
			value: tree.value,
			nodeKind: VisualNodeKind.ValueNode,
			sharedTreeSchemaData: tree.schema.allowedTypes,
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
			sharedTreeSchemaData: tree.schema.allowedTypes,
		};
	}
}

/**
 * Returns the allowed fields & types for the object fields.
 */
function getObjectAllowedTypes(schema: ObjectNodeStoredSchema): string {
	let result = "";

	for (const [fieldKey, treeFieldStoredSchema] of schema.objectNodeFields) {
		// Set of allowed tree types {@link TreeTypeSet}.
		const fieldTypes = treeFieldStoredSchema.types;

		let fieldAllowedType = fieldKey === "" ? "" : `${fieldKey} : `;

		// If not specified, types are unconstrained.
		if (fieldTypes === undefined) {
			fieldAllowedType += "any";
		} else {
			for (const type of fieldTypes) {
				fieldAllowedType += `${type} | `;
			}
		}

		// Slice the trailing ` | ` from the `fieldAllowedType`.
		fieldAllowedType = `${fieldAllowedType.slice(0, -3)}, `;

		result += fieldAllowedType;
	}

	// Slice the trailing `, ` from the `result`.
	result = result.slice(0, -2);

	return `{ ${result} }`;
}

/**
 * Returns the allowed fields & types for the map fields.
 */
function getMapAllowedTypes(
	fields: FieldMapObject<JsonableTree> | undefined,
	schema: MapNodeStoredSchema,
): string {
	let fieldAllowedTypes = "";

	const mapFieldAllowedTypes = schema.mapFields.types;

	if (mapFieldAllowedTypes === undefined) {
		fieldAllowedTypes = "any";
	} else {
		for (const type of mapFieldAllowedTypes) {
			fieldAllowedTypes += `${type} | `;
		}
	}

	// Slice the trailing ` | ` from the `fieldAllowedType`.
	fieldAllowedTypes = fieldAllowedTypes.slice(0, -3);

	assert(fields !== undefined, "MapNodeStoredSchema fields undefined.");

	let result = "";
	for (const [fieldKey] of Object.entries(fields)) {
		result += `${fieldKey} : ${fieldAllowedTypes}, `;
	}

	// Slice the trailing `, ` from the `result`.
	result = result.slice(0, -2);

	return `{ ${result} }`;
}

/**
 * Returns the allowed fields & types for the leaf fields.
 */
function getLeafAllowedTypes(schema: TreeFieldStoredSchema): string {
	let result = "";
	const leafTypes = schema.types;

	if (leafTypes === undefined) {
		result = "any";
	} else {
		for (const type of leafTypes) {
			result += `${type} | `;
		}
	}

	// Slice the trailing ` | ` from the `result`.
	result = `${result.slice(0, -3)}`;

	return result;
}

/**
 * Returns the schema & leaf value of the node with type {@link LeafNodeStoredSchema}.
 */
function visualizeLeafNodeStoredSchema(
	tree: JsonableTree,
	allowedTypes: string | undefined,
): SharedTreeLeafNode {
	return {
		schema: {
			schemaType: SharedTreeSchemaType.LeafNodeStoredSchema,
			allowedTypes,
		},
		value: JSON.stringify(tree.value),
		kind: VisualSharedTreeNodeKind.LeafNode,
	};
}

/**
 * Returns the schema & fields of the node with type {@link ObjectNodeStoredSchema}.
 */
function visualizeObjectNodeStoredSchema(
	tree: JsonableTree,
	schema: ObjectNodeStoredSchema,
	contentSnapshot: SharedTreeContentSnapshot,
): VisualSharedTreeNode {
	const treeFields = tree.fields;

	if (treeFields === undefined || Object.keys(treeFields).length === 0) {
		return {
			schema: {
				name: tree.type,
				schemaType: SharedTreeSchemaType.ObjectNodeStoredSchema,
				allowedTypes: getObjectAllowedTypes(schema),
			},
			fields: {},
			kind: VisualSharedTreeNodeKind.InternalNode,
		};
	}

	const fields: Record<string | number, VisualSharedTreeNode> = {};

	// If the child node is a leaf node, get the allowed types from the parent schema before entering {@link visualizeSharedTreeNodeBySchema}.
	let leafAllowedTypes;

	// {@link EmptyKey} indicates an array field (e.g., `schemabuilder.array()`).
	// Hides level of indirection by omitting the empty key in the visual output.
	if (
		Object.keys(treeFields).length === 1 &&
		Object.prototype.hasOwnProperty.call(treeFields, EmptyKey)
	) {
		const children = treeFields[EmptyKey];

		for (let i = 0; i < children.length; i++) {
			const childSchema = contentSnapshot.schema.nodeSchema.get(children[i].type);

			// If the node within the array is a leaf node, get the allowed types from the parent schema.
			if (childSchema instanceof LeafNodeStoredSchema) {
				const parentSchema = schema.objectNodeFields;

				for (const [, leafSchema] of parentSchema) {
					leafAllowedTypes = getLeafAllowedTypes(leafSchema);
				}
			}

			fields[i] = visualizeSharedTreeNodeBySchema(
				children[i],
				childSchema,
				contentSnapshot,
				leafAllowedTypes as string,
			);
		}
	} else {
		for (const [fieldKey, childField] of Object.entries(treeFields)) {
			assert(
				childField.length === 1,
				"Non-array node should not have more than one child field.",
			);
			const childSchema = contentSnapshot.schema.nodeSchema.get(childField[0].type);

			// If the child field is a leaf node, get the allowed types from the parent schema.
			if (childSchema instanceof LeafNodeStoredSchema) {
				const parentSchema = schema.objectNodeFields;

				for (const [leafKey, leafSchema] of parentSchema) {
					if (leafKey === fieldKey) {
						leafAllowedTypes = getLeafAllowedTypes(leafSchema);
					}
				}
			}

			fields[fieldKey] = visualizeSharedTreeNodeBySchema(
				childField[0],
				childSchema,
				contentSnapshot,
				leafAllowedTypes as string,
			);
		}
	}

	return {
		schema: {
			name: tree.type,
			schemaType: SharedTreeSchemaType.ObjectNodeStoredSchema,
			allowedTypes: getObjectAllowedTypes(schema),
		},
		fields,
		kind: VisualSharedTreeNodeKind.InternalNode,
	};
}

/**
 * Returns the schema & fields of the node with type {@link MapNodeStoredSchema}.
 */
function visualizeMapNodeStoredSchema(
	tree: JsonableTree,
	schema: MapNodeStoredSchema,
	contentSnapshot: SharedTreeContentSnapshot,
): VisualSharedTreeNode {
	const treeFields = tree.fields;

	if (treeFields === undefined || Object.keys(treeFields).length === 0) {
		return {
			schema: {
				name: tree.type,
				schemaType: SharedTreeSchemaType.MapNodeStoredSchema,
				allowedTypes: getMapAllowedTypes(treeFields, schema),
			},
			fields: {},
			kind: VisualSharedTreeNodeKind.InternalNode,
		};
	}

	const fields: Record<string | number, VisualSharedTreeNode> = {};

	for (const [fieldKey, childField] of Object.entries(treeFields)) {
		assert(
			childField.length === 1,
			"Non-array node should not have more than one child field.",
		);

		const fieldSchema = contentSnapshot.schema.nodeSchema.get(childField[0].type);
		let result = "";

		if (fieldSchema instanceof LeafNodeStoredSchema) {
			const mapAllowedTypes = schema.mapFields.types;

			if (mapAllowedTypes === undefined) {
				result = "any";
			} else {
				for (const type of mapAllowedTypes) {
					result += `${type} | `;
				}
				result = `${result.slice(0, -3)}`;
			}
		}

		fields[fieldKey] = visualizeSharedTreeNodeBySchema(
			childField[0],
			fieldSchema,
			contentSnapshot,
			result,
		);
	}

	return {
		schema: {
			name: tree.type,
			schemaType: SharedTreeSchemaType.MapNodeStoredSchema,
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
	leafAllowedTypes?: string,
): VisualSharedTreeNode {
	if (schema instanceof LeafNodeStoredSchema) {
		return visualizeLeafNodeStoredSchema(tree, leafAllowedTypes);
	} else if (schema instanceof ObjectNodeStoredSchema) {
		return visualizeObjectNodeStoredSchema(tree, schema, contentSnapshot);
	} else if (schema instanceof MapNodeStoredSchema) {
		return visualizeMapNodeStoredSchema(tree, schema, contentSnapshot);
	} else {
		throw new TypeError("Unrecognized schema type.");
	}
}
