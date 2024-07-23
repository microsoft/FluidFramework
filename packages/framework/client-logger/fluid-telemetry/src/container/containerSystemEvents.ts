/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This object contains a non-exhaustive set of the unique event names of raw {@link @fluidframework/fluid-static#IFluidContainerEvents | system events } produced by Fluid containers.
 * It's important to note that each actual system events is a function signature such as `(event: "readonly", listener: (readonly: boolean) => void): void;`
 * but this object only captures the event name in each function.
 *
 * @privateremarks This should probably exist within IContainer itself instead of being defined here.
 */
export const IFluidContainerSystemEventNames = {
	CONNECTED: "connected",
	DISCONNECTED: "disconnected",
	DISPOSED: "disposed",
} as const;

/**
 * The type for all values within {@link IFluidContainerSystemEventNames}
 */
export type IFluidContainerSystemEventName =
	(typeof IFluidContainerSystemEventNames)[keyof typeof IFluidContainerSystemEventNames];
