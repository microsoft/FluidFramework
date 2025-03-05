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
export { createDOProviderContainerRuntimeFactory } from "./rootDataObject.js";
export { createServiceAudience } from "./serviceAudience.js";
export type {
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

// Re-export so other packages don't need to pull in container-runtime
// TODO: Should we re-export?
export type { CompatibilityMode } from "@fluidframework/container-runtime";
export { compatibilityModeRuntimeOptions } from "@fluidframework/container-runtime/internal";
