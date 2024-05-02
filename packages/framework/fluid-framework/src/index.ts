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
	IAudienceEvents,
	ISelf,
} from "@fluidframework/container-definitions";
export { AttachState } from "@fluidframework/container-definitions";
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
	ErasedType,
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
	IFluidSerializer,
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

	// public namespace with internal members used in public types:
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

// ===============================================================
// Legacy exports

export { SharedObject, SharedObjectCore } from "@fluidframework/shared-object-base/internal";

// TODO: these specific exports end up still producing imports, then having those imports reexported.
export type {
	EventEmitterEventType,
	TypedEventEmitter,
	// It is unclear why ae-forgotten-export requires this since its not referenced.
	TypedEventTransform,
} from "@fluid-internal/client-utils";

export type {
	EventEmitterWithErrorHandling,
	ITelemetryLoggerExt,
	ITelemetryGenericEventExt,
	ITelemetryErrorEventExt,
	ITelemetryPerformanceEventExt,
	TelemetryEventCategory,
	ITelemetryPropertiesExt,
	TelemetryEventPropertyTypeExt,
} from "@fluidframework/telemetry-utils/internal";

export { ContainerErrorTypes } from "@fluidframework/container-definitions/internal";

export type {
	IDirectory,
	IDirectoryEvents,
	IDirectoryValueChanged,
	ISharedDirectory,
	ISharedDirectoryEvents,
	ISharedMap,
	ISharedMapEvents,
	IValueChanged,
} from "@fluidframework/map/internal";

export {
	DirectoryFactory,
	MapFactory,
	SharedDirectory,
	SharedMap,
} from "@fluidframework/map/internal";

export type {
	DeserializeCallback,
	InteriorSequencePlace,
	IInterval,
	IIntervalCollectionEvent,
	IIntervalCollection,
	IntervalIndex,
	IntervalStickiness,
	ISequenceDeltaRange,
	ISerializableInterval,
	ISerializedInterval,
	ISharedIntervalCollection,
	ISharedSegmentSequenceEvents,
	ISharedString,
	SequencePlace,
	SharedStringSegment,
	Side,
} from "@fluidframework/sequence/internal";

export {
	IntervalType,
	SequenceDeltaEvent,
	SequenceEvent,
	SequenceInterval,
	SequenceMaintenanceEvent,
	SharedSegmentSequence,
	SharedString,
} from "@fluidframework/sequence/internal";

export type {
	Client,
	IJSONSegment,
	IMergeTreeDeltaCallbackArgs,
	IMergeTreeDeltaOpArgs,
	IMergeTreeGroupMsg,
	IMergeTreeMaintenanceCallbackArgs,
	IRelativePosition,
	ISegment,
	ISegmentAction,
	LocalReferencePosition,
	Marker,
	MergeTreeDeltaOperationType,
	MergeTreeDeltaOperationTypes,
	MergeTreeMaintenanceType,
	MergeTreeRevertibleDriver,
	PropertiesManager,
	PropertySet,
	ReferencePosition,
	ReferenceType,
	SlidingPreference,
	TextSegment,
	IClientEvents,
	IMergeTreeOptions,
	SegmentGroup,
	IMergeTreeAnnotateMsg,
	IMergeTreeRemoveMsg,
	IMergeTreeObliterateMsg,
	IMergeTreeInsertMsg,
	CollaborationWindow,
	IMergeTreeOp,
	IMergeTreeTextHelper,
	IMergeTreeAttributionOptions,
	IMergeNodeCommon,
	IRemovalInfo,
	IMergeTreeSegmentDelta,
	IMoveInfo,
	SegmentGroupCollection,
	TrackingGroupCollection,
	IAttributionCollection,
	IAttributionCollectionSpec,
	AttributionPolicy,
	IAttributionCollectionSerializer,
	LocalReferenceCollection,
	PropertiesRollback,
	BaseSegment,
	IJSONMarkerSegment,
	IMergeTreeDelta,
	MergeTreeDeltaType,
	IMergeTreeDeltaOp,
	MapLike,
	IJSONTextSegment,
	IMarkerDef,
	TrackingGroup,
	Trackable,
	ITrackingGroup,
	SerializedAttributionCollection,
	SequenceOffsets,
} from "@fluidframework/merge-tree/internal";

export { Deferred } from "@fluidframework/core-utils/internal";

export type {
	AttributionKey,
	OpAttributionKey,
	DetachedAttributionKey,
	LocalAttributionKey,
	// Linked in docs
	AttributionInfo,
} from "@fluidframework/runtime-definitions/internal";
