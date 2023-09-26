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

import { type ISharedObject } from "@fluidframework/shared-object-base";
import { SharedCell } from "@fluidframework/cell";
import { type Edit, type EditSharedObject } from "./DataEditing";

/**
 * Default {@link EditSharedObject} for {@link SharedCell}.
 */
export const editSharedCell: EditSharedObject = async (
	sharedObject: ISharedObject,
	edit: Edit,
): Promise<void> => {
	const sharedCell = sharedObject as SharedCell;
	sharedCell.set(edit.data);
};

/**
 * Default {@link EditSharedObject} for {@link SharedCounter}.
 */
export const editSharedCounter: EditSharedObject = async (
	sharedObject: ISharedObject,
	edit: Edit,
): Promise<void> => {
	if (typeof edit.data !== "number") {
		console.error("Devtools recieved a non-number edit for SharedCounter");
		return;
	}

	if (Number.isInteger(edit.data)) {
		console.error("Devtools recieved a non-integer edit for SharedCounter");
	}
	const sharedCounter = sharedObject as SharedCounter;
	sharedCounter.increment(edit.data - sharedCounter.value);
};

/**
 * Default {@link EditSharedObject} for {@link SharedString}.
 */
export const editSharedString: EditSharedObject = async (
	sharedObject: ISharedObject,
	edit: Edit,
): Promise<void> => {
	if (typeof edit.data !== "string") {
		console.error("Devtools recieved a non-string edit for SharedString");
		return;
	}
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
	[SharedCell.getFactory().type]: editSharedCell,
	[SharedCounter.getFactory().type]: editSharedCounter,
	[SharedString.getFactory().type]: editSharedString,

	// TODO: the others
};
