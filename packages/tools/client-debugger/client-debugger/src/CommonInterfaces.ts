/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Base interface used in message data for events targeting a particular debugger instance via
 * its Container ID.
 *
 * @public
 */
export interface HasContainerId {
	/**
	 * The ID of the Container whose metadata is being requested.
	 */
	containerId: string;
}

/**
 * A unique ID for a Fluid object.
 *
 * @public
 */
export type FluidObjectId = string;

/**
 * Base interface used in message data for events targeting a particular Fluid object (DDS) via
 * a unique ID.
 *
 * @public
 */
export interface HasFluidObjectId {
	/**
	 * The ID of the Fluid object (DDS) whose data is being requested.
	 */
	fluidObjectId: FluidObjectId;
}
