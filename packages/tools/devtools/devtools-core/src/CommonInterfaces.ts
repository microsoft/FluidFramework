/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable } from "@fluidframework/datastore-definitions";
import { SharedObjectEdit } from "./data-visualization";

/**
 * A key used to identify and differentiate Containers registered with the {@link IFluidDevtools}.
 *
 * @remarks Each Container registered with the Devtools must be assigned a unique `containerKey`.
 *
 * @example "Canvas Container"
 *
 * @public
 */
export type ContainerKey = string;

/**
 * Common interface for data associated with a particular Container registered with the Devtools.
 *
 * @public
 */
export interface HasContainerKey {
	/**
	 * {@inheritDoc ContainerKey}
	 */
	containerKey: ContainerKey;
}

/**
 * A unique ID for a Fluid object
 *
 * @public
 */
export type FluidObjectId = string;

/**
 * Base interface used in message data for events targeting a particular Fluid object (DDS) via
 * a unique ID.
 *
 * @internal
 */
export interface HasFluidObjectId {
	/**
	 * The ID of the Fluid object (DDS) associated with data or a request.
	 */
	fluidObjectId: FluidObjectId;
}

/**
 * Base interface used in message data for edits allowed by a particular Fluid object (DDS) via
 * an enum.
 *
 * @public
 */
export enum EditType {
	number = "number",
	string = "string",
	boolean = "boolean",
}

/**
 * Base interface used in message data for edit events containing the allowed edits as an array of EditType.
 *
 * @internal
 */
export interface HasEditType {
	editType: EditType;
}

/**
 * Base interface used in message data for communicating edits
 * @public
 */
export interface HasSharedObjectEdit {
	edit: SharedObjectEdit;
}

/**
 * Base interface used in message data for edit events containing the new data.
 *
 * @internal
 */
export interface HasNewData {
	newData: Serializable<unknown>;
}
