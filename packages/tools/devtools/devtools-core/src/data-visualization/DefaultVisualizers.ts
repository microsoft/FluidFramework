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
import { type IDirectory, SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { SharedString } from "@fluidframework/sequence";
import type {
	ISharedTree,
	JsonableTree,
	TreeStoredSchema,
	FieldKey,
} from "@fluidframework/tree/internal";
import {
	ObjectNodeStoredSchema,
	SharedTree,
	// LeafNodeStoredSchema,
	// ObjectNodeStoredSchema,
} from "@fluidframework/tree/internal";
import { assert } from "@fluidframework/core-utils";
import { type ISharedObject } from "@fluidframework/shared-object-base";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { EditType } from "../CommonInterfaces";
import { type VisualizeChildData, type VisualizeSharedObject } from "./DataVisualization";
import {
	type FluidObjectNode,
	type FluidObjectTreeNode,
	type FluidObjectValueNode,
	type FluidUnknownObjectNode,
	VisualNodeKind,
	type VisualChildNode,
	type VisualTreeNode,
} from "./VisualTree";

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
	const sharedMap = sharedObject as SharedMap;

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

// eslint-disable-next-line @rushstack/no-new-null
type VisualizedLeaf = string | boolean | number | IFluidHandle | null;

interface VisualizedField {
	schema: string[];
	required: boolean;
	children: VisualizedTreeNode[];
}

interface VisualizedObject {
	name: string;
	fields: VisualizedField[];
}

type VisualizedTreeNode = VisualizedObject | VisualizedLeaf;

// function objectNodeSchemaVisualizer(
// 	treeView: JsonableTree,
// 	objectNodeStoredSchema: ObjectNodeStoredSchema,
// 	objectNodeSchemaKeys: IterableIterator<FieldKey>,
// ): VisualizedObject {
// 	const fields: VisualizedField[] = [];

// 	for (const objectKey of objectNodeSchemaKeys) {
// 		const field = objectNodeStoredSchema.objectNodeFields.get(objectKey);

// 		fields.push({});
// 	}

// 	return {
// 		name: treeView.type,
// 		fields,
// 	};
// }

function objectNodeStoredSchemaHelper(
	tree: JsonableTree,
	objectNodeSchema: ObjectNodeStoredSchema,
	objectNodeStoredSchemaKeys: Iterable<FieldKey>,
): void {
	const fields: VisualizedField[] = [];

	for (const objectKey of objectNodeStoredSchemaKeys) {
		const field = objectNodeSchema.objectNodeFields.get(objectKey);

		if (field === undefined) {
			continue;
		}

		const children = tree.fields?.[objectKey];
		if (children === undefined) {
			continue;
		}

		assert(children !== undefined, "Tree schema not defined!");
		const visualizedChildren = children.map((child: JsonableTree) =>
			jsonableToVisualized(child, field as unknown as TreeStoredSchema),
		);

		console.log(visualizedChildren);
	}
}

function jsonableToVisualized(tree: JsonableTree, schema: TreeStoredSchema): VisualizedTreeNode {
	if (tree.value !== undefined) {
		return tree.value;
	}

	const nodeSchemaType = schema.nodeSchema.get(tree.type);
	assert(nodeSchemaType !== undefined, "Tree schema not defined!");

	if (nodeSchemaType instanceof ObjectNodeStoredSchema) {
		const objectNodeStoredSchemaKeys = nodeSchemaType.objectNodeFields.keys();

		objectNodeStoredSchemaHelper(tree, nodeSchemaType, objectNodeStoredSchemaKeys);

		console.log(objectNodeStoredSchemaKeys);
	}

	/**
	 * in the same file as the type for tree stored schema, there are classes that inherit from that one
	 * you need to use instanceof to check for instances of those classes (leaf schema, object schema, and map schema)
	 * then you can use those to print what you need
	 */
	// if (nodeSchemaType instanceof LeafNodeStoredSchema) {
	// 	console.log("LeafNodeStoredSchema!");
	// } else if (nodeSchemaType instanceof ObjectNodeStoredSchema) {
	// 	const objectNodeSchemaKeys = nodeSchemaType.objectNodeFields.keys();

	// 	objectNodeSchemaVisualizer(tree, nodeSchemaType, objectNodeSchemaKeys);
	// } else {
	// 	console.log("MapNodeStoredSchema");
	// }

	const fields: VisualizedField[] = [];
	if (tree.fields !== undefined) {
		for (const fieldKey of Object.keys(tree.fields)) {
			const field = tree.fields[fieldKey];

			fields.push({
				schema: [], // This should be what is returned from the fooSchemaVisualizer function above.
				required: true, // This should be what is returned from the fooSchemaVisualizer function above.
				children: field.map((child: JsonableTree) => {
					return jsonableToVisualized(child, schema);
				}),
			});
		}
	}

	return {
		name: tree.type,
		fields,
	};
}

/**
 * {@link VisualizeSharedObject} for {@link ISharedTree}.
 */
export const visualizeSharedTree: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	visualizeChildData: VisualizeChildData,
): Promise<FluidObjectTreeNode> => {
	const sharedTree = sharedObject as ISharedTree;
	const content = sharedTree.contentSnapshot();

	const treeRoot = content.tree[0];
	const treeSchema = content.schema;

	const visualTree = jsonableToVisualized(treeRoot, treeSchema);

	return {
		fluidObjectId: sharedTree.id,
		children: {
			tree: await visualizeChildData(visualTree),
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
