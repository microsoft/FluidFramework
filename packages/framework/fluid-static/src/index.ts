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
	type InitialObjects,
} from "./fluidContainer.js";
export { createDOProviderContainerRuntimeFactory } from "./rootDataObject.js";
export { createServiceAudience } from "./serviceAudience.js";
export type {
	CompatibilityMode,
	ContainerSchema,
	ContainerAttachProps,
	IConnection,
	IMember,
	IProvideRootDataObject,
	IRootDataObject,
	IServiceAudience,
	IServiceAudienceEvents,
	LoadableObjectRecord,
	MemberChangedListener,
	Myself,
} from "./types.js";
