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
	IAudience,
	IDeltaManagerEvents,
	IDeltaSender,
	IDeltaQueue,
	ReadOnlyInfo,
	IConnectionDetails,
	IDeltaQueueEvents,
} from "@fluidframework/container-definitions";
export { AttachState } from "@fluidframework/container-definitions";
export { ContainerErrorTypes } from "@fluidframework/container-definitions/internal";
export { DriverErrorTypes } from "@fluidframework/driver-definitions";
export type { IAnyDriverError, IDriverErrorBase } from "@fluidframework/driver-definitions";
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
	FluidObject,
	IErrorBase,
	IEvent,
	IEventProvider,
	IEventThisPlaceHolder,
	IFluidHandle,
	IFluidLoadable,
	FluidObjectProviderKeys,
	ITelemetryBaseProperties,
	IEventTransformer,
	IProvideFluidHandle,
	IProvideFluidLoadable,
	TransformedEvent,
	TelemetryBaseEventPropertyType,
	Tagged,
	ReplaceIEventThisPlaceHolder,
	IErrorEvent,
	IFluidHandleContext,
	ITelemetryBaseLogger,
	IProvideFluidHandleContext,
	IRequest,
	IResponse,
	ITelemetryBaseEvent,
	LogLevel,
	IDisposable as IDisposable_2,
} from "@fluidframework/core-interfaces";
export type {
	IChannel,
	IChannelAttributes,
	IChannelServices,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IDeltaConnection,
	IChannelStorageService,
	IFluidDataStoreRuntimeEvents,
	IDeltaHandler,
} from "@fluidframework/datastore-definitions";
export type {
	ISharedObject,
	ISharedObjectEvents,
	ISharedObjectKind,
} from "@fluidframework/shared-object-base";
export type {
	IClient,
	IClientConfiguration,
	IClientDetails,
	IDocumentMessage,
	IQuorumClients,
	ISequencedDocumentMessage,
	ISignalMessage,
	ITokenClaims,
	ICapabilities,
	ConnectionMode,
	IUser,
	ISequencedClient,
	ITrace,
	IBranchOrigin,
	ISignalMessageBase,
	ISummaryTree,
	SummaryObject,
	ISummaryBlob,
	ISummaryHandle,
	ISummaryAttachment,
	SummaryTypeNoHandle,

	// Internal exports required due to being linked from public APIs:
	ISequencedDocumentMessageExperimental,
	ISequencedDocumentAugmentedMessage,

	// public namespace with internal members ued in public types:
	SummaryType,
} from "@fluidframework/protocol-definitions";
export type {
	IExperimentalIncrementalSummaryContext,
	IGarbageCollectionData,
	IInboundSignalMessage,
	ISummaryTreeWithStats,
	ITelemetryContext,
	ISummaryStats,
} from "@fluidframework/runtime-definitions";
export type {
	IIdCompressor,
	SessionId,
	SessionSpaceCompressedId,
	OpSpaceCompressedId,
	StableId,
} from "@fluidframework/id-compressor";

// Let the tree package manage its own API surface, we will simply reflect it here.
// Note: this only surfaces the `@public` API items from the tree package. If the `@beta` and `@alpha` items are
// desired, they can be added by re-exporting from one of the package's aliased export paths instead (e.g. `tree
// alpha` to surface everything `@alpha` and higher).
// eslint-disable-next-line no-restricted-syntax
export * from "@fluidframework/tree";
