/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This module contains default {@link VisualizeSharedObject | visualization}
 * implementations for our DDSs.
 */

import { SharedCell, type ISharedCell } from "@fluidframework/cell/internal";
import { SharedCounter } from "@fluidframework/counter/internal";
import {
	type IDirectory,
	type ISharedMap,
	SharedMap,
	type ISharedDirectory,
	SharedDirectory,
} from "@fluidframework/map/internal";
import { SharedMatrix } from "@fluidframework/matrix/internal";
import { SharedString } from "@fluidframework/sequence/internal";
import type { ISharedObject, IChannelView } from "@fluidframework/shared-object-base/internal";
import type { ITreeInternal } from "@fluidframework/tree/internal";
import { FieldKind, SharedTree } from "@fluidframework/tree/internal";

import { EditType } from "../CommonInterfaces.js";
import { getKeyForFluidObject } from "../FluidObjectKey.js";

import type { VisualizeChildData, VisualizeSharedObject } from "./DataVisualization.js";
import {
	concatenateTypes,
	determineNodeKind,
	toVisualTree,
	visualizeSharedTreeBySchema,
} from "./SharedTreeVisualizer.js";
import type { VisualSharedTreeNode } from "./VisualSharedTreeTypes.js";
import {
	type FluidObjectNode,
	type FluidObjectTreeNode,
	type FluidObjectValueNode,
	type FluidUnknownObjectNode,
	type VisualChildNode,
	VisualNodeKind,
	type VisualTreeNode,
} from "./VisualTree.js";

/**
 * Default {@link VisualizeSharedObject} for {@link SharedCell}.
 */
export const visualizeSharedCell: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	visualizeChildData: VisualizeChildData,
): Promise<FluidObjectNode> => {
	const sharedCell = sharedObject as ISharedCell<unknown>;
	const data = sharedCell.get();
	const objectId = getKeyForFluidObject(sharedCell);

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
				fluidObjectId: objectId,
				typeMetadata: "SharedCell",
				nodeKind: VisualNodeKind.FluidTreeNode,
				editProps,
			};
		}
		case VisualNodeKind.ValueNode: {
			return {
				...renderedData,
				fluidObjectId: objectId,
				typeMetadata: "SharedCell",
				nodeKind: VisualNodeKind.FluidValueNode,
				editProps,
			};
		}
		case VisualNodeKind.TreeNode: {
			return {
				...renderedData,
				fluidObjectId: objectId,
				typeMetadata: "SharedCell",
				nodeKind: VisualNodeKind.FluidTreeNode,
				editProps,
			};
		}
		case VisualNodeKind.UnknownObjectNode: {
			return {
				fluidObjectId: objectId,
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
 * Creates a visualizer function for a DataObject.
 * @param parentId - The ID of the parent DataObject (used for debugging/logging purposes)
 * @returns A VisualizeSharedObject function that generates a visual representation of a DataObject
 */
export function createDataObjectVisualizer(parentId: string): VisualizeSharedObject {
	return async (
		dataObjectRoot: ISharedObject,
		visualizeChildData: VisualizeChildData,
	): Promise<FluidObjectTreeNode> => {
		const renderedChildData = (await visualizeSharedDirectory(
			dataObjectRoot,
			visualizeChildData,
		)) as FluidObjectTreeNode;

		return {
			fluidObjectId: getKeyForFluidObject(dataObjectRoot),
			children: renderedChildData.children,
			metadata: renderedChildData.metadata,
			typeMetadata: "DataObject",
			nodeKind: VisualNodeKind.FluidTreeNode,
		};
	};
}

/**
 * Creates a visualizer function for a TreeDataObject.
 * @param parentId - The ID of the parent TreeDataObject (used for debugging/logging purposes)
 * @returns A VisualizeSharedObject function that generates a visual representation of a TreeDataObject
 */
export function createTreeDataObjectVisualizer(parentId: string): VisualizeSharedObject {
	return async (
		rootTree: ISharedObject,
		visualizeChildData: VisualizeChildData,
	): Promise<FluidObjectTreeNode> => {
		const renderedChildData = (await visualizeSharedTree(
			rootTree,
			visualizeChildData,
		)) as FluidObjectTreeNode;

		return {
			fluidObjectId: getKeyForFluidObject(rootTree),
			children: renderedChildData.children,
			metadata: renderedChildData.metadata,
			typeMetadata: "TreeDataObject",
			nodeKind: VisualNodeKind.FluidTreeNode,
		};
	};
}

/**
 * Default {@link VisualizeSharedObject} for {@link SharedCounter}.
 */
export const visualizeSharedCounter: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
): Promise<FluidObjectValueNode> => {
	const sharedCounter = sharedObject as SharedCounter;
	return {
		fluidObjectId: getKeyForFluidObject(sharedCounter),
		value: sharedCounter.value,
		typeMetadata: "SharedCounter",
		nodeKind: VisualNodeKind.FluidValueNode,
		editProps: { editTypes: [EditType.Number] },
	};
};

/**
 * Default {@link VisualizeSharedObject} for {@link SharedDirectory}.
 */
export const visualizeSharedDirectory: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	visualizeChildData: VisualizeChildData,
): Promise<FluidObjectTreeNode> => {
	const sharedDirectory = sharedObject as ISharedDirectory;
	const renderedChildData = await visualizeDirectory(sharedDirectory, visualizeChildData);
	return {
		fluidObjectId: getKeyForFluidObject(sharedDirectory),
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
		fluidObjectId: getKeyForFluidObject(sharedMap),
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
	const sharedMatrix = sharedObject as unknown as SharedMatrix;

	const { rowCount, colCount: columnCount } = sharedMatrix;
	const objectId = getKeyForFluidObject(sharedMatrix);

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
		fluidObjectId: objectId,
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
		fluidObjectId: getKeyForFluidObject(sharedString),
		value: text,
		typeMetadata: "SharedString",
		nodeKind: VisualNodeKind.FluidValueNode,
		editProps: { editTypes: [EditType.String] },
	};
};

/**
 * {@link VisualizeSharedObject} for {@link ITree}.
 *
 * TODO: [ADO 31468] Refactor the SharedTreeVisualizer to conform to SharedTree API
 */
export const visualizeSharedTree: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	visualizeChildData: VisualizeChildData,
): Promise<FluidObjectNode> => {
	const sharedTree = sharedObject as IChannelView as ITreeInternal;
	const objectId = getKeyForFluidObject(sharedTree);

	// Root node of the SharedTree's content.
	const treeView = sharedTree.exportVerbose();
	// All schema definitions for the SharedTree.
	const treeSimpleSchema = sharedTree.exportSimpleSchema();
	const treeDefinitions = treeSimpleSchema.definitions;

	/**
	 * {@link visualizeSharedTreeBySchema} passes `allowedTypes` into co-recursive functions while constructing the visual representation.
	 * Since the {@link SimpleTreeSchema.allowedTypes} of each children node is only accessible at the parent field level,
	 * each node's allowed types are computed at the parent field level.
	 */
	const allowedTypes = treeSimpleSchema.root.allowedTypesIdentifiers;
	const isRequired = treeSimpleSchema.root.kind === FieldKind.Required;

	if (treeView === undefined) {
		return {
			fluidObjectId: objectId,
			typeMetadata: "SharedTree",
			nodeKind: VisualNodeKind.FluidTreeNode,
			tooltipContents: {
				schema: {
					nodeKind: VisualNodeKind.TreeNode,
					children: {
						allowedTypes: {
							nodeKind: VisualNodeKind.ValueNode,
							value: concatenateTypes(allowedTypes),
						},
						isRequired: {
							nodeKind: VisualNodeKind.ValueNode,
							value: isRequired.toString(),
						},
					},
				},
			},
			children: {},
		};
	}

	// Create a root field visualization that shows the allowed types at the root
	const visualTreeRepresentation: VisualSharedTreeNode = await visualizeSharedTreeBySchema(
		treeView,
		treeDefinitions,
		{ allowedTypes, isRequired },
		visualizeChildData,
	);

	// Maps the `visualTreeRepresentation` in the format compatible to {@link visualizeChildData} function.
	const visualTree = toVisualTree(visualTreeRepresentation);

	// TODO: Validate the type casting.
	const visualTreeResult: FluidObjectNode = {
		...visualTree,
		fluidObjectId: objectId,
		typeMetadata: "SharedTree",
		nodeKind: determineNodeKind(visualTree.nodeKind),
	} as unknown as FluidObjectNode;

	return visualTreeResult;
};

/**
 * {@link VisualizeSharedObject} for unrecognized {@link ISharedObject}s.
 */
export const visualizeUnknownSharedObject: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
): Promise<FluidUnknownObjectNode> => {
	return {
		fluidObjectId: getKeyForFluidObject(sharedObject),
		typeMetadata: sharedObject.attributes.type,
		nodeKind: VisualNodeKind.FluidUnknownObjectNode,
	};
};

/**
 * List of default visualizers included in the library.
 * @remarks {@link @fluidframework/aqueduct#DataObject} & {@link @fluidframework/aqueduct#TreeDataObject} do not have type information and thus are not included in the list.
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
