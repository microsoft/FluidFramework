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
import type { ISharedTree } from "@fluidframework/tree/internal";
import { SharedTree, encodeTreeSchema } from "@fluidframework/tree/internal";
import { type ISharedObject } from "@fluidframework/shared-object-base";
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
 * {@link VisualizeSharedObject} for {@link ISharedTree}.
 */
export const visualizeSharedTree: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	visualizeChildData: VisualizeChildData,
): Promise<FluidObjectTreeNode> => {
	const sharedTree = sharedObject as ISharedTree;
	const content = sharedTree.contentSnapshot();

	return {
		fluidObjectId: sharedTree.id,
		children: {
			tree: await visualizeChildData(content.tree),
			schema: await visualizeChildData(encodeTreeSchema(content.schema)),
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
