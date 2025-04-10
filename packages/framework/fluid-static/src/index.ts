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
	isInternalFluidContainer,
	type IFluidContainer,
	type IFluidContainerEvents,
	type IFluidContainerInternal,
	type InitialObjects,
} from "./fluidContainer.js";
export {
	createDOProviderContainerRuntimeFactory,
	DOProviderContainerRuntimeFactory,
	RootDataObject,
	type RootDataObjectProps,
} from "./rootDataObject.js";
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
	LoadableObjectKindRecord,
	MemberChangedListener,
	Myself,
} from "./types.js";
