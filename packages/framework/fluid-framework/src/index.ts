/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The **fluid-framework** package bundles a collection of Fluid Framework client libraries for easy use
 * when paired with a corresponding service client library (for example,
 * `\@fluidframework/azure-client` or `\@fluidframework/tinylicious-client`).
 *
 * @packageDocumentation
 */

export type { ICriticalContainerError } from "@fluidframework/container-definitions";
export { AttachState, ContainerErrorType } from "@fluidframework/container-definitions";
export { DriverErrorType } from "@fluidframework/driver-definitions";
export { ConnectionState } from "@fluidframework/container-loader";
export type {
	ContainerSchema,
	DataObjectClass,
	IConnection,
	IFluidContainer,
	IFluidContainerEvents,
	IMember,
	IServiceAudience,
	IServiceAudienceEvents,
	LoadableObjectClass,
	LoadableObjectClassRecord,
	LoadableObjectCtor,
	MemberChangedListener,
	SharedObjectClass,
} from "@fluidframework/fluid-static";
export type { ISharedMap, ISharedMapEvents, IValueChanged } from "@fluidframework/map";
export { SharedMap } from "@fluidframework/map";

// The tree package manages its own API surface.
// eslint-disable-next-line no-restricted-syntax
export * from "@fluidframework/tree";
