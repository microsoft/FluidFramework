/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This module contains default {@link EditSharedObject}
 * implementations for our DDSs.
 */

import { SharedCounter } from "@fluidframework/counter";
import { SharedString } from "@fluidframework/sequence";

import { ISharedObject } from "@fluidframework/shared-object-base";
import { Edit, EditSharedObject } from "./DataEditing";

/**
 * Default {@link EditSharedObject} for {@link SharedCounter}.
 */
export const editSharedCounter: EditSharedObject = async (
	sharedObject: ISharedObject,
	edit: Edit,
): Promise<void> => {
	console.log("testing editSharedCounter");
	if (typeof edit.data !== "number") return;
	const sharedCounter = sharedObject as SharedCounter;
	sharedCounter.increment(Math.floor(edit.data) - sharedCounter.value);
};

/**
 * Default {@link EditSharedObject} for {@link SharedString}.
 */
export const editSharedString: EditSharedObject = async (
	sharedObject: ISharedObject,
	edit: Edit,
): Promise<void> => {
	if (typeof edit.data !== "string") return;
	const sharedString = sharedObject as SharedString;
	if (edit.data === "") {
		sharedString.removeText(0, sharedString.getLength());
	} else {
		sharedString.replaceText(0, sharedString.getLength(), edit.data);
	}
};

/**
 * List of default editors included in the library.
 */
export const defaultEditors: Record<string, EditSharedObject> = {
	[SharedCounter.getFactory().type]: editSharedCounter,
	[SharedString.getFactory().type]: editSharedString,

	// TODO: the others
};
