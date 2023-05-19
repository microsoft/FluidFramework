/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A unique ID for a Container registered with the Devtools.
 *
 * @remarks
 *
 * Note: this is an arbitrary identifier.
 * It is not necessarily the underlying Container object's ID, nor the ID of the associated document.
 * This value is strictly used to differentiate Containers registered with the Devtools.
 *
 * @internal
 */
export type ContainerId = string;

/**
 * Common interface for data associated with a particular Container registered with the Devtools.
 *
 * @internal
 */
export interface HasContainerId {
	/**
	 * The ID of the registered Container associated with data or a request.
	 */
	containerId: ContainerId;
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
