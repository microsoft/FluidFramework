/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	SimpleMapNodeSchema,
	SimpleNodeSchema,
	SimpleObjectNodeSchema,
	VerboseTree,
	VerboseTreeNode,
} from "@fluidframework/tree/internal";
import { NodeKind, SchemaFactory, Tree } from "@fluidframework/tree/internal";

import type { VisualizeChildData } from "./DataVisualization.js";
import type { VisualSharedTreeNode, SharedTreeSchemaNode } from "./VisualSharedTreeTypes.js";
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
 * Converts the visual representation from {@link visualizeInternalNodeBySchema} to a visual tree compatible with the devtools-view.
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
export function concatenateTypes(fieldTypes: ReadonlySet<string>): string {
	return [...fieldTypes].join(" | ");
}

/**
 * Returns the allowed fields & types for the object fields (e.g., `foo : string | number, bar: boolean`)
 */
// function getObjectAllowedTypes(schema: SimpleObjectNodeSchema): string {
// 	const result: string[] = [];

// 	for (const [fieldKey, treeFieldSimpleSchema] of Object.entries(schema.fields)) {
// 		const fieldTypes = treeFieldSimpleSchema.allowedTypes;
// 		result.push(`${fieldKey} : ${concatenateTypes(fieldTypes)}`);
// 	}

// 	return `{ ${result.join(", ")} }`;
// }

/**
 * Returns the schema & fields of the node.
 */
async function visualizeVerboseNodeFields(
	treeFields: VerboseTree[] | Record<string, VerboseTree>,
	treeDefinitions: ReadonlyMap<string, SimpleNodeSchema>,
	allowedTypes: Record<string, string>,
	visualizeChildData: VisualizeChildData,
): Promise<Record<string, VisualSharedTreeNode>> {
	const fields: Record<string | number, VisualSharedTreeNode> = {};

	for (const [fieldKey, childField] of Object.entries(treeFields)) {
		fields[fieldKey] = await visualizeSharedTreeBySchema(
			childField,
			treeDefinitions,
			allowedTypes[fieldKey],
			visualizeChildData,
		);
	}

	return fields;
}

function getObjectAllowedTypes(schema: SimpleObjectNodeSchema): Record<string, string> {
	const result: Record<string, string> = {};

	for (const [fieldKey, treeFieldSimpleSchema] of Object.entries(schema.fields)) {
		const fieldTypes = treeFieldSimpleSchema.allowedTypes;
		result[fieldKey] = concatenateTypes(fieldTypes);
	}

	return result;
}

/**
 * Returns the schema & fields of the node with type {@link ObjectNodeStoredSchema}.
 */
async function visualizeObjectNode(
	tree: VerboseTreeNode,
	treeDefinitions: ReadonlyMap<string, SimpleNodeSchema>,
	allowedTypes: string,
	visualizeChildData: VisualizeChildData,
): Promise<VisualSharedTreeNode> {
	const objectAllowedTypes = getObjectAllowedTypes(
		treeDefinitions.get(tree.type) as SimpleObjectNodeSchema,
	);

	console.log("objectAllowedTypes", objectAllowedTypes);

	return {
		schema: {
			schemaName: tree.type,
			allowedTypes,
		},
		fields: await visualizeVerboseNodeFields(
			tree.fields,
			treeDefinitions,
			objectAllowedTypes,
			visualizeChildData,
		),
		kind: VisualSharedTreeNodeKind.InternalNode,
	};
}

/**
 * Returns the schema & fields of the node with type {@link MapNodeStoredSchema}.
 */
async function visualizeMapNode(
	tree: VerboseTreeNode,
	nodeSchema: SimpleMapNodeSchema,
	treeDefinitions: ReadonlyMap<string, SimpleNodeSchema>,
	allowedTypes: string,
	visualizeChildData: VisualizeChildData,
): Promise<VisualSharedTreeNode> {
	const mapAllowedTypes: Record<string, string> = {};

	for (const key of Object.keys(tree.fields)) {
		mapAllowedTypes[key] = concatenateTypes(nodeSchema.allowedTypes);
	}
	return {
		schema: {
			schemaName: tree.type,
			allowedTypes,
		},
		fields: await visualizeVerboseNodeFields(
			tree.fields,
			treeDefinitions,
			mapAllowedTypes,
			visualizeChildData,
		),
		kind: VisualSharedTreeNodeKind.InternalNode,
	};
}

/**
 * Helper function to create the visual representation of non-leaf SharedTree nodes.
 * Processes internal tree nodes based on their schema type (e.g., ObjectNodeStoredSchema, MapNodeStoredSchema, ArrayNodeStoredSchema),
 * producing the visual representation for each type.
 *
 * @see {@link https://fluidframework.com/docs/data-structures/tree/} for more information on the SharedTree schema.
 *
 * @remarks
 */
async function visualizeInternalNodeBySchema(
	tree: VerboseTreeNode,
	treeDefinitions: ReadonlyMap<string, SimpleNodeSchema>,
	allowedTypes: string,
	visualizeChildData: VisualizeChildData,
): Promise<VisualSharedTreeNode> {
	const schema = treeDefinitions.get(tree.type);

	if (schema === undefined) {
		throw new TypeError("Unrecognized schema type.");
	}

	switch (schema.kind) {
		case NodeKind.Object: {
			const objectVisualized = visualizeObjectNode(
				tree,
				treeDefinitions,
				allowedTypes,
				visualizeChildData,
			);
			return objectVisualized;
		}
		case NodeKind.Map: {
			const mapVisualized = visualizeMapNode(
				tree,
				schema,
				treeDefinitions,
				allowedTypes,
				visualizeChildData,
			);
			return mapVisualized;
		}
		case NodeKind.Array: {
			const fields: Record<number, VisualSharedTreeNode> = {};
			const children = tree.fields;
			if (!Array.isArray(children)) {
				throw new TypeError("Invalid array");
			}

			const arrayAllowedTypes: Record<string, string> = {};
			for (let i = 0; i < children.length; i++) {
				arrayAllowedTypes[i] = concatenateTypes(schema.allowedTypes);

				fields[i] = await visualizeSharedTreeBySchema(
					children[i],
					treeDefinitions,
					arrayAllowedTypes[i],
					visualizeChildData,
				);
			}

			return {
				schema: {
					schemaName: tree.type,
					allowedTypes,
				},
				fields: await visualizeVerboseNodeFields(
					tree.fields,
					treeDefinitions,
					arrayAllowedTypes,
					visualizeChildData,
				),
				kind: VisualSharedTreeNodeKind.InternalNode,
			};
		}
		default: {
			throw new TypeError("Unrecognized schema type.");
		}
	}
}

/**
 * Creates a visual representation of a SharedTree based on its schema.
 * @param tree - The {@link VerboseTree} to visualize
 * @param treeSchema - The schema that defines the structure and types of the tree
 * @param visualizeChildData - Callback function to visualize child node data
 * @returns A visual representation of the tree that includes schema information and node values
 *
 * @remarks
 * This function handles both leaf nodes (primitive values, handles) and internal nodes (objects, maps, arrays).
 * For leaf nodes, it creates a visual representation with the node's schema and value.
 * For internal nodes, it recursively processes the node's fields using {@link visualizeInternalNodeBySchema}.
 */
export async function visualizeSharedTreeBySchema(
	tree: VerboseTree,
	treeDefinitions: ReadonlyMap<string, SimpleNodeSchema>,
	allowedTypes: string,
	visualizeChildData: VisualizeChildData,
): Promise<VisualSharedTreeNode> {
	const schemaFactory = new SchemaFactory(undefined);

	return Tree.is(tree, [
		schemaFactory.boolean,
		schemaFactory.null,
		schemaFactory.number,
		schemaFactory.handle,
		schemaFactory.string,
	])
		? {
				schema: {
					schemaName: Tree.schema(tree).identifier,
					allowedTypes,
				},
				value: await visualizeChildData(tree),
				kind: VisualSharedTreeNodeKind.LeafNode,
			}
		: visualizeInternalNodeBySchema(tree, treeDefinitions, allowedTypes, visualizeChildData);
}
