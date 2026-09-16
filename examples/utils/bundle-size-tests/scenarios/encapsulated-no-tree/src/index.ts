/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file re-exports the public/legacy API surface for bundle-size testing.
/* eslint-disable import-x/no-internal-modules -- legacy imports trigger this rule. */

export {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
} from "@fluidframework/aqueduct/legacy";

export {
	type IAudienceOwner,
	type ICodeDetailsLoader,
	type IContainer,
	type IContainerLoadMode,
	type ICriticalContainerError,
	type IFluidCodeDetails,
	type IFluidModuleWithDetails,
	type IRuntimeFactory,
	type ISelf,
	LoaderHeader,
} from "@fluidframework/container-definitions/legacy";

export {
	ConnectionState,
	type ILoaderProps,
	type IProtocolHandler,
	Loader,
	type ProtocolHandlerBuilder,
} from "@fluidframework/container-loader/legacy";

export {
	CompressionAlgorithms,
	type IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/legacy";

export type {
	ConfigTypes,
	FluidObject,
	IConfigProviderBase,
	IErrorBase,
	IFluidHandle,
	ILoggingError,
	IRequest,
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
	ITelemetryBaseProperties,
} from "@fluidframework/core-interfaces/legacy";

export type {
	IChannelAttributes,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/legacy";

export {
	type ConnectionMode,
	type IClient,
	type IClientConfiguration,
	type ICommittedProposal,
	type ICreateBlobResponse,
	type IDocumentAttributes,
	type IDocumentDeltaConnection,
	type IDocumentDeltaStorageService,
	type IDocumentMessage,
	type IDocumentService,
	type IDocumentServiceFactory,
	type IDocumentStorageService,
	type IProcessMessageResult,
	type IResolvedUrl,
	type IQuorum,
	type ISequencedClient,
	type ISequencedDocumentMessage,
	type ISequencedProposal,
	type ISignalClient,
	type ISignalMessage,
	type ISnapshotTree,
	type IStream,
	type ISummaryBlob,
	type ISummaryContext,
	type ISummaryHandle,
	type ISummaryTree,
	type ITokenClaims,
	type IUrlResolver,
	type IUser,
	type IVersion,
	MessageType,
	ScopeType,
	SummaryType,
} from "@fluidframework/driver-definitions/legacy";

export { type ISharedDirectory, SharedDirectory } from "@fluidframework/map/legacy";

export {
	type PropertySet,
	type ReferencePosition,
	ReferenceType,
	refGetTileLabels,
	Marker,
} from "@fluidframework/merge-tree/legacy";

export type {
	IContainerRuntimeBase,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions/legacy";

export {
	type ISharedString,
	type SequenceInterval,
	type ISequenceOverlappingIntervalsIndex,
	SharedString,
	Side,
	createOverlappingIntervalsIndex,
} from "@fluidframework/sequence/legacy";

export {
	type ITelemetryLoggerExt,
	createChildLogger,
} from "@fluidframework/telemetry-utils/legacy";
