/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	SimpleMapNodeSchema,
	SimpleObjectNodeSchema,
	SimpleTreeSchema,
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
function concatenateTypes(fieldTypes: ReadonlySet<string>): string {
	return [...fieldTypes].join(" | ");
}

/**
 * Returns the allowed fields & types for the object fields (e.g., `foo : string | number, bar: boolean`)
 */
function getObjectAllowedTypes(schema: SimpleObjectNodeSchema): string {
	const result: string[] = [];

	for (const [fieldKey, treeFieldSimpleSchema] of Object.entries(schema.fields)) {
		const fieldTypes = treeFieldSimpleSchema.allowedTypes;
		result.push(`${fieldKey} : ${concatenateTypes(fieldTypes)}`);
	}

	return `{ ${result.join(", ")} }`;
}

/**
 * Returns the schema & fields of the node.
 */
async function visualizeVerboseNodeFields(
	tree: VerboseTreeNode,
	treeSchema: SimpleTreeSchema,
	visualizeChildData: VisualizeChildData,
): Promise<Record<string, VisualSharedTreeNode>> {
	const treeFields = tree.fields;

	const fields: Record<string | number, VisualSharedTreeNode> = {};

	for (const [fieldKey, childField] of Object.entries(treeFields)) {
		fields[fieldKey] = await visualizeSharedTreeNodeBySchema(
			childField,
			treeSchema,
			visualizeChildData,
		);
	}

	return fields;
}

/**
 * Returns the schema & fields of the node with type {@link ObjectNodeStoredSchema}.
 */
async function visualizeObjectNode(
	tree: VerboseTreeNode,
	nodeSchema: SimpleObjectNodeSchema,
	treeSchema: SimpleTreeSchema,
	visualizeChildData: VisualizeChildData,
): Promise<VisualSharedTreeNode> {
	return {
		schema: {
			schemaName: tree.type,
			allowedTypes: getObjectAllowedTypes(nodeSchema),
		},
		fields: await visualizeVerboseNodeFields(tree, treeSchema, visualizeChildData),
		kind: VisualSharedTreeNodeKind.InternalNode,
	};
}

/**
 * Returns the schema & fields of the node with type {@link MapNodeStoredSchema}.
 */
async function visualizeMapNode(
	tree: VerboseTreeNode,
	nodeSchema: SimpleMapNodeSchema,
	treeSchema: SimpleTreeSchema,
	visualizeChildData: VisualizeChildData,
): Promise<VisualSharedTreeNode> {
	return {
		schema: {
			schemaName: tree.type,
			allowedTypes: `Record<string, ${concatenateTypes(nodeSchema.allowedTypes)}>`,
		},
		fields: await visualizeVerboseNodeFields(tree, treeSchema, visualizeChildData),
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
	tree: VerboseTree,
	treeSchema: SimpleTreeSchema,
	visualizeChildData: VisualizeChildData,
): Promise<VisualSharedTreeNode> {
	const sf = new SchemaFactory(undefined);
	if (Tree.is(tree, [sf.boolean, sf.null, sf.number, sf.handle, sf.string])) {
		const nodeSchema = Tree.schema(tree);
		return {
			schema: {
				schemaName: nodeSchema.identifier,
			},
			value: await visualizeChildData(tree),
			kind: VisualSharedTreeNodeKind.LeafNode,
		};
	}

	const schema = treeSchema.definitions.get(tree.type);
	if (schema === undefined) {
		throw new TypeError("Unrecognized schema type.");
	}

	switch (schema.kind) {
		case NodeKind.Object: {
			const objectVisualized = visualizeObjectNode(
				tree,
				schema,
				treeSchema,
				visualizeChildData,
			);
			return objectVisualized;
		}
		case NodeKind.Map: {
			const mapVisualized = visualizeMapNode(tree, schema, treeSchema, visualizeChildData);
			return mapVisualized;
		}
		case NodeKind.Array: {
			const fields: Record<number, VisualSharedTreeNode> = {};
			const children = tree.fields;
			if (!Array.isArray(children)) {
				throw new TypeError("Invalid array");
			}

			for (let i = 0; i < children.length; i++) {
				fields[i] = await visualizeSharedTreeNodeBySchema(
					children[i],
					treeSchema,
					visualizeChildData,
				);
			}

			return {
				schema: {
					schemaName: tree.type,
					allowedTypes: concatenateTypes(schema.allowedTypes),
				},
				fields: await visualizeVerboseNodeFields(tree, treeSchema, visualizeChildData),
				kind: VisualSharedTreeNodeKind.InternalNode,
			};
		}
		default: {
			throw new TypeError("Unrecognized schema type.");
		}
	}
}
