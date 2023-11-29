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
	IFluidContainer,
	IFluidContainerEvents,
	InitialObjects,
} from "./fluidContainer";
export { createDOProviderContainerRuntimeFactory } from "./rootDataObject";
export { createServiceAudience } from "./serviceAudience";
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
	IProvideRootDataObject,
} from "./types";
