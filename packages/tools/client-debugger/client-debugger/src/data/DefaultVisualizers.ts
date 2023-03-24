/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedCounter } from "@fluidframework/counter";
import { SharedMap } from "@fluidframework/map";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { VisualizeChildData, VisualizeSharedObject } from "./DataSummary";

import { NodeKind, VisualTreeNode } from "./VisualTree";

/**
 * Default {@link VisualizeSharedObject} for {@link SharedCounter}.
 */
export const visualizeSharedCounter: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	label: string,
) => {
	const sharedCounter = sharedObject as SharedCounter;
	return {
		fluidObjectId: sharedCounter.id,
		label,
		value: `${sharedCounter.value}`,
		typeMetadata: "SharedCounter",
		nodeType: NodeKind.FluidValueNode,
	};
};

/**
 * Default {@link VisualizeSharedObject} for {@link SharedMap}.
 */
export const visualizeSharedMap: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	label: string,
	visualizeChildData: VisualizeChildData,
) => {
	const sharedMap = sharedObject as SharedMap;

	const children: VisualTreeNode[] = [];
	for (const [key, value] of sharedMap) {
		const renderedChild = await visualizeChildData(value, key);
		children.push(renderedChild);
	}

	return {
		fluidObjectId: sharedMap.id,
		label,
		children,
		typeMetadata: "SharedMap",
		nodeType: NodeKind.FluidTreeNode,
	};
};

/**
 * {@link VisualizeSharedObject} for unrecognized {@link ISharedObject}s.
 */
export const visualizeUnknownSharedObject: VisualizeSharedObject = async (
	sharedObject: ISharedObject,
	label: string,
) => {
	return {
		fluidObjectId: sharedObject.id,
		label,
		value: "Unrecognized Fluid data.",
		typeMetadata: "Unknown",
		nodeType: NodeKind.FluidValueNode,
	};
};
