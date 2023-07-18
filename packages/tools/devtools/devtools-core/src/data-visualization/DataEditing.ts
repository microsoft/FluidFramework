/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedObject } from "@fluidframework/shared-object-base";
import { Serializable } from "@fluidframework/datastore-definitions";
import { EditType, FluidObjectId } from "../CommonInterfaces";

/**
 * Generates a description of the edit to be applied to {@link @fluidframework/shared-object-base#ISharedObject}'s
 * current state.
 *
 * @param sharedObject - The {@link ISharedObject} whose data will be edited.
 * @param edit - Describes what changes will be made using {@link Edit}.
 * @returns - Nothing.
 *
 * @public
 */
export type EditSharedObject = (sharedObject: ISharedObject, edit: Edit) => Promise<void>;

/**
 * Interface to contain information necesary for an edit
 * @public
 */
export interface Edit {
	/**
	 * Contains the {@link FluidObjectId} of the DDS that will be edited
	 */
	fluidId: FluidObjectId;

	/**
	 * Type contains the {@link EditType} of the edit being preformed
	 */
	type: EditType;

	/**
	 * Data contains the new data that will be edited into the DDS
	 */
	data: Serializable;
}
