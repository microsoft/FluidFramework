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
} from "./fluidContainer";
export { createDOProviderContainerRuntimeFactory } from "./rootDataObject";
export { createServiceAudience } from "./serviceAudience";
export {
	type ContainerSchema,
	type ContainerAttachProps,
	type DataObjectClass,
	type IConnection,
	type IMember,
	type IRootDataObject,
	type IServiceAudience,
	type IServiceAudienceEvents,
	type LoadableObjectClass,
	type LoadableObjectClassRecord,
	type LoadableObjectCtor,
	type LoadableObjectRecord,
	type MemberChangedListener,
	type Myself,
	type SharedObjectClass,
	type IProvideRootDataObject,
} from "./types";
