/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A key used to identify and differentiate Containers registered with the {@link @fluidframework/devtools-core#IFluidDevtools}.
 *
 * @remarks Each Container registered with the Devtools must be assigned a unique `containerKey`.
 *
 * @example "Canvas Container"
 *
 * @beta
 */
export type ContainerKey = string;

/**
 * Common interface for data associated with a particular Container registered with the Devtools.
 *
 * @sealed
 * @system
 * @beta
 */
export interface HasContainerKey {
	/**
	 * {@inheritDoc ContainerKey}
	 */
	readonly containerKey: ContainerKey;
}

/**
 * A unique ID for a Fluid object
 *
 * @internal
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
	readonly fluidObjectId: FluidObjectId;
}

/**
 * Represents the type selection for an edit being applied to a Shared Object.
 *
 * @internal
 */
export const EditType = {
	/**
	 * Indicates that the data associated with an edit is or must be a `boolean`.
	 */
	Boolean: "boolean",

	/**
	 * Indicates that the data associated with an edit is or must be a `number`.
	 */
	Number: "number",

	/**
	 * Indicates that the data associated with an edit is or must be a `string`.
	 */
	String: "string",

	/**
	 * Indicates that the data associated with an edit is or must be a `undefined`.
	 */
	Undefined: "undefined",

	/**
	 * Indicates that the data associated with an edit is or must be a `null`.
	 */
	Null: "null",
} as const;

/**
 * {@inheritDoc (EditType:variable)}
 * @internal
 */
export type EditType = (typeof EditType)[keyof typeof EditType];
