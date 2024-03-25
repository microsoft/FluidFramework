/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This module contains default {@link VisualizeSharedObject | visualization}
 * implementations for our DDSs.
 */

import { SharedCell } from "@fluidframework/cell";
import { SharedCounter } from "@fluidframework/counter";
import { type IDirectory, SharedDirectory, SharedMap, type ISharedMap } from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { SharedString } from "@fluidframework/sequence";
import type {
	ISharedTree,
	JsonableTree,
	SharedTreeContentSnapshot,
	TreeNodeStoredSchema,
} from "@fluidframework/tree/internal";
import {
	LeafNodeStoredSchema,
	ObjectNodeStoredSchema,
	SharedTree,
} from "@fluidframework/tree/internal";
import { type ISharedObject } from "@fluidframework/shared-object-base";
import { EditType } from "../CommonInterfaces.js";
import { type VisualizeChildData, type VisualizeSharedObject } from "./DataVisualization.js";
import {
	type FluidObjectNode,
	type FluidObjectTreeNode,
	type FluidObjectValueNode,
	type FluidUnknownObjectNode,
	VisualNodeKind,
	type VisualChildNode,
	type VisualTreeNode,
	type Primitive,
} from "./VisualTree.js";

/**
 * Default {@link VisualizeSharedObject} for {@link SharedCell}.
 */
export const visualizeSharedCell: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	visualizeChildData: VisualizeChildData,
): Promise<FluidObjectNode> => {
	const sharedCell = sharedObject as SharedCell<unknown>;
	const data = sharedCell.get();

	const renderedData = await visualizeChildData(data);

	const editProps = {
		editTypes: undefined,
	};

	// By separating cases it lets us avoid unnecessary hierarchy by flattening the tree
	switch (renderedData.nodeKind) {
		case VisualNodeKind.FluidHandleNode: {
			return {
				children: {
					data: renderedData,
				},
				fluidObjectId: sharedCell.id,
				typeMetadata: "SharedCell",
				nodeKind: VisualNodeKind.FluidTreeNode,
				editProps,
			};
		}
		case VisualNodeKind.ValueNode: {
			return {
				...renderedData,
				fluidObjectId: sharedCell.id,
				typeMetadata: "SharedCell",
				nodeKind: VisualNodeKind.FluidValueNode,
				editProps,
			};
		}
		case VisualNodeKind.TreeNode: {
			return {
				...renderedData,
				fluidObjectId: sharedCell.id,
				typeMetadata: "SharedCell",
				nodeKind: VisualNodeKind.FluidTreeNode,
				editProps,
			};
		}
		case VisualNodeKind.UnknownObjectNode: {
			return {
				fluidObjectId: sharedCell.id,
				typeMetadata: "SharedCell",
				nodeKind: VisualNodeKind.FluidUnknownObjectNode,
			};
		}
		default: {
			throw new Error("Unrecognized node kind.");
		}
	}
};

/**
 * Default {@link VisualizeSharedObject} for {@link SharedCounter}.
 */
export const visualizeSharedCounter: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
): Promise<FluidObjectValueNode> => {
	const sharedCounter = sharedObject as SharedCounter;
	return {
		fluidObjectId: sharedCounter.id,
		value: sharedCounter.value,
		typeMetadata: "SharedCounter",
		nodeKind: VisualNodeKind.FluidValueNode,
		editProps: { editTypes: [EditType.Number] },
	};
};

/**
 * Default {@link VisualizeSharedObject} for {@link SharedCounter}.
 */
export const visualizeSharedDirectory: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	visualizeChildData: VisualizeChildData,
): Promise<FluidObjectTreeNode> => {
	const sharedDirectory = sharedObject as SharedDirectory;
	const renderedChildData = await visualizeDirectory(sharedDirectory, visualizeChildData);
	return {
		fluidObjectId: sharedDirectory.id,
		children: renderedChildData.children,
		metadata: renderedChildData.metadata,
		typeMetadata: "SharedDirectory",
		nodeKind: VisualNodeKind.FluidTreeNode,
	};
};

/**
 * Generates a visual summary for an {@link @fluidframework/map#IDirectory}.
 *
 * @remarks Used by {@link visualizeSharedDirectory} to recurse down non-Shared-Object subdirectories.
 */
async function visualizeDirectory(
	directory: IDirectory,
	visualizeChildData: VisualizeChildData,
): Promise<VisualTreeNode> {
	const children: Record<string, VisualChildNode> = {};

	// Generate child entries for directory value content
	for (const [key, value] of directory) {
		const renderedChild = await visualizeChildData(value);
		children[key] = renderedChild;
	}

	// Generate child entries for sub-directory
	const subDirectories = directory.subdirectories();
	for (const [path, subDirectory] of subDirectories) {
		const renderedChild = await visualizeDirectory(subDirectory, visualizeChildData);
		children[path] = renderedChild;
	}

	return {
		children,
		metadata: {
			"absolute-path": directory.absolutePath,
			"values": directory.size,
			"sub-directories": directory.countSubDirectory?.(),
		},
		typeMetadata: "IDirectory",
		nodeKind: VisualNodeKind.TreeNode,
	};
}

/**
 * Default {@link VisualizeSharedObject} for {@link SharedMap}.
 */
export const visualizeSharedMap: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	visualizeChildData: VisualizeChildData,
): Promise<FluidObjectTreeNode> => {
	const sharedMap = sharedObject as ISharedMap;

	const children: Record<string, VisualChildNode> = {};
	for (const [key, value] of sharedMap) {
		const renderedChild = await visualizeChildData(value);
		children[key] = renderedChild;
	}

	return {
		fluidObjectId: sharedMap.id,
		children,
		metadata: {
			size: sharedMap.size,
		},
		typeMetadata: "SharedMap",
		nodeKind: VisualNodeKind.FluidTreeNode,
	};
};

/**
 * Default {@link VisualizeSharedObject} for {@link SharedMap}.
 */
export const visualizeSharedMatrix: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	visualizeChildData: VisualizeChildData,
): Promise<FluidObjectTreeNode> => {
	const sharedMatrix = sharedObject as SharedMatrix;

	const { rowCount, colCount: columnCount, id: fluidObjectId } = sharedMatrix;

	// Output will list cells as a flat list, keyed by their row,column indices (e.g. `[0,1]`)
	const cells: Record<string, VisualChildNode> = {};
	for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
		for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
			const cell = sharedMatrix.getCell(rowIndex, columnIndex) as unknown;
			const renderedCell = await visualizeChildData(cell);
			cells[`[${rowIndex},${columnIndex}]`] = renderedCell;
		}
	}

	return {
		fluidObjectId,
		children: cells,
		metadata: {
			rows: rowCount,
			columns: columnCount,
		},
		typeMetadata: "SharedMatrix",
		nodeKind: VisualNodeKind.FluidTreeNode,
	};
};

/**
 * Default {@link VisualizeSharedObject} for {@link SharedString}.
 */
export const visualizeSharedString: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
): Promise<FluidObjectValueNode> => {
	const sharedString = sharedObject as SharedString;
	const text = sharedString.getText();

	return {
		fluidObjectId: sharedString.id,
		value: text,
		typeMetadata: "SharedString",
		nodeKind: VisualNodeKind.FluidValueNode,
		editProps: { editTypes: [EditType.String] },
	};
};

/**
 * Base visualizer for SharedTree.
 */
interface SharedTreeNodeBase {
	schema: SharedTreeSchemaNode;
}
interface SharedTreeSchemaNode {
	/**
	 * Name of the SharedTree schema.
	 */
	name?: string;

	/**
	 * Types allowed (e.g., string, number, boolean, handle & etc.) inside the node.
	 */
	allowedTypes: string;
}

interface SharedTreeNode extends SharedTreeNodeBase {
	// TODO: Fix types.
	fields:
		| Record<
				string | number,
				SharedTreeNode | SharedTreeLeafNode | SharedTreeSchemaNode | object | undefined
		  >
		| object
		| VisualSharedTreeNode
		| undefined;
}

interface SharedTreeLeafNode extends SharedTreeNodeBase {
	value: Primitive;
}

/**
 * Returned when `tree.fields` does not exist inside the tree.
 */
interface EmptyTreeNode {
	warning: string;
}

type VisualSharedTreeNode = SharedTreeNode | SharedTreeLeafNode;

function mapVisualTreeHelper(tree: VisualSharedTreeNode): VisualChildNode {
	if ("value" in tree) {
		// Handling SharedTreeLeafNode
		return {
			value: tree.value,
			nodeKind: VisualNodeKind.ValueNode,
			metadata: { allowedTypes: tree.schema.allowedTypes ?? "" },
		};
	} else {
		// Handling SharedTreeNode
		const children: Record<string, VisualChildNode> = {};
		if (tree.fields) {
			for (const [key, value] of Object.entries(tree.fields)) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				const child = mapVisualTreeHelper(value);
				children[key] = child;
			}
		}

		return {
			children,
			typeMetadata: "FluidHandle",
			nodeKind: VisualNodeKind.TreeNode,
			metadata: {
				allowedTypes: tree.schema.allowedTypes ?? "",
			},
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

function leafNodeStoredSchemaHelper(
	tree: JsonableTree,
	schema: LeafNodeStoredSchema,
): SharedTreeLeafNode {
	return {
		schema: {
			allowedTypes: JSON.stringify(schema.leafValue),
		},
		value: JSON.stringify(tree.value),
	};
}

function objectFieldHelper(
	nodes: JsonableTree[],
	contentSnapshot: SharedTreeContentSnapshot,
): VisualSharedTreeNode | object | undefined {
	const result = {};

	for (const node of nodes) {
		const childField = node.fields;

		if (childField === undefined) {
			const nodeSchema = contentSnapshot.schema.nodeSchema.get(node.type);
			return sharedTreeVisualizer(node, nodeSchema, contentSnapshot);
		}

		const emptyKey = "";

		/**
		 * A field of type leaf, object, or map.
		 */
		if (childField[emptyKey] === undefined) {
			const schema = contentSnapshot.schema.nodeSchema.get(node.type);
			return sharedTreeVisualizer(node, schema, contentSnapshot);
		} else {
			/**
			 * The current field is an array field.
			 */
			const arrayField = childField[emptyKey];

			for (let i = 0; i < arrayField.length; i++) {
				const fieldName = arrayField[i].type;
				const childSchema = contentSnapshot.schema.nodeSchema.get(fieldName);

				const arrayVisualized = sharedTreeVisualizer(
					arrayField[i],
					childSchema,
					contentSnapshot,
				);

				result[i] = {
					...arrayVisualized,
				};
			}
		}
	}

	return result;
}

function arrayAlloedTypesHelper(fields: JsonableTree[]): string {
	let result = "";

	for (const field of fields) {
		const nodeSchema = field.type;

		result += `${nodeSchema} | `;
	}

	/**
	 * Slice the trailing ` | ` from the `result`.
	 */
	result = result.slice(0, -3);

	return result;
}

function objectNodeStoredSchemaHelper(
	tree: JsonableTree,
	schema: ObjectNodeStoredSchema,
	contentSnapshot: SharedTreeContentSnapshot,
): VisualSharedTreeNode | object | undefined | EmptyTreeNode {
	const treeFields = tree.fields;

	if (treeFields === undefined) {
		return { warning: "No fields exists in the tree." };
	}

	const objectVisualized = {};

	for (const [fieldKey, childField] of Object.entries(treeFields)) {
		const arrayAllowedTypes = arrayAlloedTypesHelper(childField);
		const childFieldVisualized = objectFieldHelper(childField, contentSnapshot);

		// TODO: If index exists add field and schema.
		objectVisualized[fieldKey] =
			childFieldVisualized !== undefined &&
			("fields" in childFieldVisualized || "value" in childFieldVisualized)
				? { ...childFieldVisualized }
				: {
						schema: {
							allowedTypes: arrayAllowedTypes,
						},
						fields: childFieldVisualized,
				  };
	}

	return objectVisualized;
}

/**
 * Main recursive helper function to create the visual representation of the SharedTree.
 * Filters tree nodes based on their schema type.
 */
function sharedTreeVisualizer(
	tree: JsonableTree,
	schema: TreeNodeStoredSchema | undefined, // TODO: TreeNodeStoredSchema can be undefined?
	contentSnapshot: SharedTreeContentSnapshot,
): VisualSharedTreeNode {
	if (schema instanceof LeafNodeStoredSchema) {
		return leafNodeStoredSchemaHelper(tree, schema);
	} else if (schema instanceof ObjectNodeStoredSchema) {
		const schemaName = tree.type;

		/**
		 * Iterates over the fields of the tree and extracts:
		 * - FieldKey
		 * - Allowed Types of the field
		 */
		const allowedTypes = allowedTypesHelper(schema);

		const visualizedObject: SharedTreeNode = {
			schema: {
				name: schemaName,
				allowedTypes,
			},
			fields: objectNodeStoredSchemaHelper(tree, schema, contentSnapshot),
		};

		return visualizedObject;
	} else {
		throw new TypeError("Unrecognized schema type.");
	}
}

/**
 * {@link VisualizeSharedObject} for {@link ISharedTree}.
 */
export const visualizeSharedTree: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	visualizeChildData: VisualizeChildData,
): Promise<FluidObjectTreeNode> => {
	const sharedTree = sharedObject as ISharedTree;
	const contentSnapshot = sharedTree.contentSnapshot();

	/**
	 * Root node of the SharedTree's treeview. Assume there is only one root node.
	 */
	const treeView = contentSnapshot.tree[0];

	/**
	 * Schema of the tree node.
	 */
	const treeSchema = contentSnapshot.schema.nodeSchema.get(treeView.type);

	/**
	 * Traverses the SharedTree and generates a visual representation of the tree (mainly composed of `schema` and `fields` field).
	 */
	const visualTreeRepresentation = sharedTreeVisualizer(treeView, treeSchema, contentSnapshot);

	console.log("visualTreeRepresentation", visualTreeRepresentation);

	/**
	 * Maps the `visualTreeRepresentation` in the format compatible to {@link visualizeChildData} function.
	 */
	const treeVisualized = mapVisualTreeHelper(visualTreeRepresentation);

	return {
		fluidObjectId: sharedTree.id,
		children: {
			tree: await visualizeChildData(treeVisualized),
		},
		typeMetadata: "SharedTree",
		nodeKind: VisualNodeKind.FluidTreeNode,
	};
};

/**
 * {@link VisualizeSharedObject} for unrecognized {@link ISharedObject}s.
 */
export const visualizeUnknownSharedObject: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
): Promise<FluidUnknownObjectNode> => {
	return {
		fluidObjectId: sharedObject.id,
		typeMetadata: sharedObject.attributes.type,
		nodeKind: VisualNodeKind.FluidUnknownObjectNode,
	};
};

/**
 * List of default visualizers included in the library.
 */
export const defaultVisualizers: Record<string, VisualizeSharedObject> = {
	[SharedCell.getFactory().type]: visualizeSharedCell,
	[SharedCounter.getFactory().type]: visualizeSharedCounter,
	[SharedDirectory.getFactory().type]: visualizeSharedDirectory,
	[SharedMap.getFactory().type]: visualizeSharedMap,
	[SharedMatrix.getFactory().type]: visualizeSharedMatrix,
	[SharedString.getFactory().type]: visualizeSharedString,
	[SharedTree.getFactory().type]: visualizeSharedTree,
	// TODO: the others
};
