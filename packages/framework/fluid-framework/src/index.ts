/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Bundles a collection of Fluid Framework client libraries for easy use when paired with a corresponding service client
 * package (e.g. `@fluidframework/azure-client`, `@fluidframework/tinylicious-client`, or `@fluid-experimental/osdp-client (BETA)`).
 *
 * @packageDocumentation
 */

export type {
	ConnectionState as ConnectionStateType, // TODO: deduplicate ConnectionState types
	ICriticalContainerError,
} from "@fluidframework/container-definitions";
export { AttachState, ContainerErrorTypes } from "@fluidframework/container-definitions";
export { DriverErrorTypes } from "@fluidframework/driver-definitions";
export { ConnectionState } from "@fluidframework/container-loader";
export type {
	ContainerAttachProps,
	ContainerSchema,
	DataObjectClass,
	IConnection,
	IFluidContainer,
	IFluidContainerEvents,
	IMember,
	InitialObjects,
	IServiceAudience,
	IServiceAudienceEvents,
	LoadableObjectClass,
	LoadableObjectClassRecord,
	MemberChangedListener,
	Myself,
	SharedObjectClass,
} from "@fluidframework/fluid-static";
export type { ISharedMap, ISharedMapEvents, IValueChanged } from "@fluidframework/map";
export { SharedMap } from "@fluidframework/map";

// Let the tree package manage its own API surface, we will simply reflect it here.
// Note: this only surfaces the `@public` API items from the tree package. If the `@beta` and `@alpha` items are
// desired, they can be added by re-exporting from one of the package's aliased export paths instead (e.g. `tree
// alpha` to surface everything `@alpha` and higher).
// eslint-disable-next-line no-restricted-syntax
export * from "@fluidframework/tree";
