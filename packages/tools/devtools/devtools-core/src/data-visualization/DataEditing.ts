/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ISharedObject } from "@fluidframework/shared-object-base";
import { type Serializable } from "@fluidframework/datastore-definitions";
import { type EditType, type HasFluidObjectId } from "../CommonInterfaces";

/**
 * Applies an edit to {@link @fluidframework/shared-object-base#ISharedObject}.
 * @param sharedObject - The {@link @fluidframework/shared-object-base#ISharedObject} whose data will be edited.
 * @param edit - Describes what changes will be made using {@link Edit}.
 *
 * @internal
 */
export type EditSharedObject = (sharedObject: ISharedObject, edit: Edit) => Promise<void>;

/**
 * Interface to contain information necessary for an edit
 * @internal
 */
export interface Edit {
	/**
	 * Type contains the {@link (EditType:type)} of the edit being preformed.
	 *
	 * @remarks This is generally expected to be of type `EditType`. `string` is supported strictly for forward / backward compatibility. If "type" is undefined then it assumes the type of data.
	 */
	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
	type?: EditType | string;

	/**
	 * Data contains the new data that will be edited into the DDS
	 */
	data: EditData;
}

/**
 * This combines all the types data might be when using EditingUI
 *
 * @internal
 */
// eslint-disable-next-line @rushstack/no-new-null
export type EditData = Serializable<unknown> | null | undefined;

/**
 * Interface to contain information necesary for an edit of a SharedObject
 * @internal
 */
export interface SharedObjectEdit extends Edit, HasFluidObjectId {}
