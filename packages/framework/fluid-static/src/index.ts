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
	FluidContainer,
	createFluidContainer,
	IFluidContainer,
	IFluidContainerEvents,
	InitialObjects,
} from "./fluidContainer";
export {
	DOProviderContainerRuntimeFactory,
	createDOProviderContainerRuntimeFactory,
} from "./rootDataObject";
export { ServiceAudience, createServiceAudience } from "./serviceAudience";
export {
	ContainerSchema,
	DataObjectClass,
	IConnection,
	IMember,
	IRootDataObject,
	IServiceAudience,
	IServiceAudienceEvents,
	LoadableObjectClass,
	LoadableObjectClassRecord,
	LoadableObjectCtor,
	LoadableObjectRecord,
	MemberChangedListener,
	Myself,
	SharedObjectClass,
} from "./types";
