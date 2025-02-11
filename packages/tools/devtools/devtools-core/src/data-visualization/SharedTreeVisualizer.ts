/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKind } from "@fluidframework/tree";
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
	if (schema.isRequired !== undefined) {
		children.isRequired = {
			nodeKind: VisualNodeKind.ValueNode,
			value: schema.isRequired,
		};
	}
	return {
		nodeKind: VisualNodeKind.TreeNode,
		children,
	};
}

/**
 * Converts the visual representation from {@link visualizeNodeBySchema} to a visual tree compatible with the devtools-view.
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
 * Concatenate allowed types for `ObjectNodeStoredSchema` and `MapNodeStoredSchema`.
 */
export function concatenateTypes(fieldTypes: ReadonlySet<string>): string {
	return [...fieldTypes].join(" | ");
}

/**
 * Properties that describe schema constraints for a field in the tree
 */
interface FieldSchemaProperties {
	/**
	 * Set of node schema (represented by name) that are valid under this field.
	 * This is a subset of the types defined in treeDefinitions.
	 */
	allowedTypes: ReadonlySet<string> | undefined;

	/**
	 * Whether the field is required (true) or optional (false).
	 *
	 * `undefined` indicates that the field is implicitly required.
	 * In this case, no requirement information will be displayed by the devtools.
	 */
	isRequired: boolean | undefined;
}

/**
 * Processes and visualizes the fields of a verbose tree node.
 *
 * @param treeFields - The fields of the tree node to visualize. Can be either an array of VerboseTree (for array nodes) or a Record of field names to VerboseTree (for object/map nodes).
 * @param treeDefinitions - Map containing all schema definitions for the entire tree structure. Each definition describes the shape and constraints of a particular node type.
 * @param requirements - Optional record mapping field names to boolean values indicating whether each field is required (true) or optional (false). Only meaningful for object node fields.
 *
 * @returns A record mapping field names/indices to their visual tree representations.
 */
async function visualizeVerboseNodeFields(
	treeFields: readonly VerboseTree[] | Record<string, VerboseTree>,
	treeDefinitions: ReadonlyMap<string, SimpleNodeSchema>,
	fieldSchemaProperties: Record<string, FieldSchemaProperties>,
	visualizeChildData: VisualizeChildData,
): Promise<Record<string, VisualSharedTreeNode>> {
	const fields: Record<string | number, VisualSharedTreeNode> = {};

	for (const [fieldKey, childField] of Object.entries(treeFields)) {
		fields[fieldKey] = await visualizeSharedTreeBySchema(
			childField,
			treeDefinitions,
			{
				allowedTypes: fieldSchemaProperties[fieldKey]?.allowedTypes,
				isRequired:
					fieldSchemaProperties[fieldKey]?.isRequired === undefined
						? undefined
						: fieldSchemaProperties[fieldKey]?.isRequired,
			},
			visualizeChildData,
		);
	}

	return fields;
}

/**
 * Extracts and stores allowed types & kind for each field ({@link SimpleFieldSchema}) of a node schema ({@link SimpleObjectNodeSchema}).
 */
function getFieldTooltipProperties(
	schema: SimpleObjectNodeSchema,
): Record<string, FieldSchemaProperties> {
	const result: Record<string, FieldSchemaProperties> = {};

	for (const [fieldKey, treeFieldSimpleSchema] of Object.entries(schema.fields)) {
		result[fieldKey] = {
			allowedTypes: treeFieldSimpleSchema.allowedTypes,
			isRequired: treeFieldSimpleSchema.kind === FieldKind.Required ? true : false,
		};
	}

	return result;
}

/**
 * Returns the schema & fields of the node with type {@link ObjectNodeStoredSchema}.
 */
async function visualizeObjectNode(
	tree: VerboseTreeNode,
	treeDefinitions: ReadonlyMap<string, SimpleNodeSchema>,
	{ allowedTypes, isRequired }: FieldSchemaProperties,
	visualizeChildData: VisualizeChildData,
): Promise<VisualSharedTreeNode> {
	const objectNodeSchemaProperties = getFieldTooltipProperties(
		treeDefinitions.get(tree.type) as SimpleObjectNodeSchema,
	);

	return {
		schema: {
			schemaName: tree.type,
			allowedTypes: concatenateTypes(allowedTypes ?? new Set()),
			isRequired: isRequired?.toString(),
		},
		fields: await visualizeVerboseNodeFields(
			tree.fields,
			treeDefinitions,
			objectNodeSchemaProperties,
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
	isRequired: boolean | undefined,
	visualizeChildData: VisualizeChildData,
): Promise<VisualSharedTreeNode> {
	const mapNodeSchemaProperties: Record<string, FieldSchemaProperties> = {};

	for (const key of Object.keys(tree.fields)) {
		mapNodeSchemaProperties[key] = {
			allowedTypes: nodeSchema.allowedTypes,
			isRequired: undefined,
		};
	}
	return {
		schema: {
			schemaName: tree.type,
			allowedTypes: concatenateTypes(nodeSchema.allowedTypes),
			isRequired: isRequired?.toString(),
		},
		fields: await visualizeVerboseNodeFields(
			tree.fields,
			treeDefinitions,
			mapNodeSchemaProperties,
			visualizeChildData,
		),
		kind: VisualSharedTreeNodeKind.InternalNode,
	};
}

/**
 * Creates the visual representation of non-leaf SharedTree nodes.
 * Processes internal tree nodes based on their schema type (e.g., ObjectNodeStoredSchema, MapNodeStoredSchema, ArrayNodeStoredSchema),
 * producing the visual representation for each type.
 *
 * @see {@link https://fluidframework.com/docs/data-structures/tree/} for more information on the SharedTree schema.
 *
 * @remarks
 */
async function visualizeNodeBySchema(
	tree: VerboseTreeNode,
	treeDefinitions: ReadonlyMap<string, SimpleNodeSchema>,
	{ allowedTypes, isRequired }: FieldSchemaProperties,
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
				{ allowedTypes, isRequired },
				visualizeChildData,
			);
			return objectVisualized;
		}
		case NodeKind.Map: {
			const mapVisualized = visualizeMapNode(
				tree,
				schema,
				treeDefinitions,
				isRequired,
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

			const arrayNodeSchemaProperties: Record<string, FieldSchemaProperties> = {};
			for (const [i, child] of children.entries()) {
				arrayNodeSchemaProperties[i] = {
					allowedTypes: schema.allowedTypes,
					isRequired: undefined,
				};

				fields[i] = await visualizeSharedTreeBySchema(
					child,
					treeDefinitions,
					{ allowedTypes: arrayNodeSchemaProperties[i]?.allowedTypes, isRequired: undefined },
					visualizeChildData,
				);
			}

			return {
				schema: {
					schemaName: tree.type,
					allowedTypes: concatenateTypes(schema.allowedTypes),
					isRequired: isRequired?.toString(),
				},
				fields: await visualizeVerboseNodeFields(
					tree.fields,
					treeDefinitions,
					arrayNodeSchemaProperties,
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
 * @param treeDefinitions - Map containing all schema definitions for the entire tree structure. Each definition
 * describes the shape and constraints of a particular node type.
 * @param allowedTypes - Set of type names that are valid for this specific node position in the tree. This is a
 * subset of the types defined in treeDefinitions.
 * @param isRequired - Whether this field is required in its parent object schema.
 * Only meaningful for direct children of object nodes.
 * Undefined for array/map elements since they are always required within their parent.
 * @param visualizeChildData - Callback function to visualize child node data
 * @returns A visual representation of the tree that includes schema information and node values
 *
 * @remarks
 * This function handles both leaf nodes (primitive values, handles) and internal nodes (objects, maps, arrays).
 * For leaf nodes, it creates a visual representation with the node's schema and value.
 * For internal nodes, it recursively processes the node's fields using {@link visualizeNodeBySchema}.
 */
export async function visualizeSharedTreeBySchema(
	tree: VerboseTree,
	treeDefinitions: ReadonlyMap<string, SimpleNodeSchema>,
	{ allowedTypes, isRequired }: FieldSchemaProperties,
	visualizeChildData: VisualizeChildData,
): Promise<VisualSharedTreeNode> {
	return Tree.is(tree, SchemaFactory.leaves)
		? {
				schema: {
					schemaName: Tree.schema(tree).identifier,
					allowedTypes: concatenateTypes(allowedTypes ?? new Set()),
					isRequired: isRequired?.toString(),
				},
				value: await visualizeChildData(tree),
				kind: VisualSharedTreeNodeKind.LeafNode,
			}
		: visualizeNodeBySchema(
				tree,
				treeDefinitions,
				{ allowedTypes, isRequired },
				visualizeChildData,
			);
}
