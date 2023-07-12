/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This module contains default {@link EditSharedObject}
 * implementations for our DDSs.
 */

import { SharedCell } from "@fluidframework/cell";
import { SharedCounter } from "@fluidframework/counter";
import { SharedString } from "@fluidframework/sequence";

import { ISharedObject } from "@fluidframework/shared-object-base";
import { EditSharedObject } from "./DataEditing";

/**
 * Default {@link EditSharedObject} for {@link SharedCell}.
 */
export const editSharedCell: EditSharedObject = async (
	sharedObject: ISharedObject,
): Promise<void> => {
	const sharedCell = sharedObject as SharedCell<unknown>;
	const data = sharedCell.get();
	console.log(data);
};

/**
 * Default {@link VisualizeSharedObject} for {@link SharedCounter}.
 */
export const editSharedCounter: EditSharedObject = async (
	sharedObject: ISharedObject,
): Promise<void> => {
	const sharedCounter = sharedObject as SharedCounter;
	console.log(sharedCounter);
};

/**
 * Default {@link EditSharedObject} for {@link SharedString}.
 */
export const editSharedString: EditSharedObject = async (
	sharedObject: ISharedObject,
	newData: string,
): Promise<void> => {
	const sharedString = sharedObject as SharedString;
	if (newData === "") {
		sharedString.removeText(0, sharedString.getLength());
	} else {
		sharedString.replaceText(0, sharedString.getLength(), newData);
	}
	return;
};

/**
 * {@link EditSharedObject} for unrecognized {@link ISharedObject}s.
 */
export const editUnknownSharedObject: EditSharedObject = async (
	sharedObject: ISharedObject,
): Promise<void> => {
	console.log("Editing unknown shared object");
};

/**
 * List of default editors included in the library.
 */
export const defaultEditors: Record<string, EditSharedObject> = {
	[SharedCell.getFactory().type]: editSharedCell,
	[SharedCounter.getFactory().type]: editSharedCounter,
	[SharedString.getFactory().type]: editSharedString,

	// TODO: the others
};
