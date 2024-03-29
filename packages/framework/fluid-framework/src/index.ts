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
	IDeltaManager,
} from "@fluidframework/container-definitions";
export { AttachState } from "@fluidframework/container-definitions";
export { ContainerErrorTypes } from "@fluidframework/container-definitions/internal";
export type {
	DriverErrorTypes,
	IAnyDriverError,
	IDriverErrorBase,
} from "@fluidframework/driver-definitions";
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
} from "@fluidframework/fluid-static";
export type { ISharedMap, ISharedMapEvents, IValueChanged } from "@fluidframework/map";
export { SharedMap } from "@fluidframework/map";

export type {
	ISharedObject,
	ISharedObjectEvents,
	ISharedObjectKind,
} from "@fluidframework/shared-object-base";
export type {
	FluidObject,
	FluidObjectProviderKeys,
	IDisposable,
	IErrorBase,
	IErrorEvent,
	IEvent,
	IEventProvider,
	IEventThisPlaceHolder,
	IEventTransformer,
	IFluidHandle,
	IFluidHandleContext,
	IFluidLoadable,
	IProvideFluidHandle,
	IProvideFluidHandleContext,
	IProvideFluidLoadable,
	IRequest,
	IResponse,
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
	ITelemetryBaseProperties,
	LogLevel,
	ReplaceIEventThisPlaceHolder,
	Tagged,
	TelemetryBaseEventPropertyType,
	TransformedEvent,
} from "@fluidframework/core-interfaces";
export type {
	IAudience,
	IConnectionDetails,
	IDeltaManagerEvents,
	IDeltaQueue,
	IDeltaQueueEvents,
	IDeltaSender,
	ReadOnlyInfo,
} from "@fluidframework/container-definitions";
export type {
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IChannelStorageService,
	IDeltaConnection,
	IDeltaHandler,
	IFluidDataStoreRuntime,
	IFluidDataStoreRuntimeEvents,
} from "@fluidframework/datastore-definitions";
// export type { IDisposable } from "@fluidframework/common-definitions";

// Let the tree package manage its own API surface, we will simply reflect it here.
// Note: this only surfaces the `@public` API items from the tree package. If the `@beta` and `@alpha` items are
// desired, they can be added by re-exporting from one of the package's aliased export paths instead (e.g. `tree
// alpha` to surface everything `@alpha` and higher).
// eslint-disable-next-line no-restricted-syntax
export * from "@fluidframework/tree";

// Tree's IDisposable implementation is different than the one in core-utils
export type { IDisposable as IDisposableTree } from "@fluidframework/tree";
