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
import { SharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { VisualizeChildData, VisualizeSharedObject } from "./DataVisualization";

import {
	FluidObjectTreeNode,
	FluidObjectValueNode,
	FluidUnknownObjectNode,
	NodeKind,
	VisualNode,
} from "./VisualTree";

/**
 * Default {@link VisualizeSharedObject} for {@link SharedCell}.
 */
export const visualizeSharedCell: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	label: string,
	visualizeChildData: VisualizeChildData,
): Promise<FluidObjectTreeNode> => {
	const sharedCell = sharedObject as SharedCell<unknown>;
	const data = sharedCell.get();

	const renderedData = await visualizeChildData(data, "data");

	return {
		fluidObjectId: sharedCell.id,
		label,
		children: [renderedData],
		typeMetadata: "SharedCell",
		nodeKind: NodeKind.FluidTreeNode,
	};
};

/**
 * Default {@link VisualizeSharedObject} for {@link SharedCounter}.
 */
export const visualizeSharedCounter: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	label: string,
): Promise<FluidObjectValueNode> => {
	const sharedCounter = sharedObject as SharedCounter;
	return {
		fluidObjectId: sharedCounter.id,
		label,
		value: sharedCounter.value,
		typeMetadata: "SharedCounter",
		nodeKind: NodeKind.FluidValueNode,
	};
};

/**
 * Default {@link VisualizeSharedObject} for {@link SharedMap}.
 */
export const visualizeSharedMap: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	label: string,
	visualizeChildData: VisualizeChildData,
): Promise<FluidObjectTreeNode> => {
	const sharedMap = sharedObject as SharedMap;

	const children: VisualNode[] = [];
	for (const [key, value] of sharedMap) {
		const renderedChild = await visualizeChildData(value, key);
		children.push(renderedChild);
	}

	return {
		fluidObjectId: sharedMap.id,
		label,
		children,
		typeMetadata: "SharedMap",
		nodeKind: NodeKind.FluidTreeNode,
	};
};

/**
 * Default {@link VisualizeSharedObject} for {@link SharedString}.
 */
export const visualizeSharedString: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	label: string,
): Promise<FluidObjectValueNode> => {
	const sharedString = sharedObject as SharedString;
	const text = sharedString.getText();

	return {
		fluidObjectId: sharedString.id,
		label,
		value: text,
		typeMetadata: "SharedString",
		nodeKind: NodeKind.FluidValueNode,
	};
};

/**
 * {@link VisualizeSharedObject} for unrecognized {@link ISharedObject}s.
 */
export const visualizeUnknownSharedObject: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	label: string,
): Promise<FluidUnknownObjectNode> => {
	return {
		fluidObjectId: sharedObject.id,
		label,
		typeMetadata: sharedObject.attributes.type,
		nodeKind: NodeKind.FluidUnknownNode,
	};
};

/**
 * List of default visualizers included in the library.
 */
export const defaultVisualizers: Record<string, VisualizeSharedObject> = {
	[SharedCell.getFactory().type]: visualizeSharedCell,
	[SharedCounter.getFactory().type]: visualizeSharedCounter,
	[SharedMap.getFactory().type]: visualizeSharedMap,
	[SharedString.getFactory().type]: visualizeSharedString,
	// TODO: the others
};
