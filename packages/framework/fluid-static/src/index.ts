/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Provides a simple and powerful way to consume collaborative Fluid data.
 *
 * @packageDocumentation
 */

export {
	createFluidContainer,
	type IFluidContainer,
	type IFluidContainerEvents,
	type IFluidContainerInternal,
	type InitialObjects,
	isInternalFluidContainer,
} from "./fluidContainer.js";
export { createDOProviderContainerRuntimeFactory } from "./rootDataObject.js";
export { createServiceAudience } from "./serviceAudience.js";
export { createTreeContainerRuntimeFactory } from "./treeRootDataObject.js";
export type {
	CompatibilityMode,
	ContainerAttachProps,
	ContainerSchema,
	IConnection,
	IMember,
	IServiceAudience,
	IServiceAudienceEvents,
	MemberChangedListener,
	Myself,
	TreeContainerSchema,
} from "./types.js";
export { isTreeContainerSchema } from "./utils.js";
