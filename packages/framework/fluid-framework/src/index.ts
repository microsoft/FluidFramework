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

export {
    AttachState,
    ContainerErrorType,
    ICriticalContainerError,
} from "@fluidframework/container-definitions";
export { DriverErrorType } from "@fluidframework/driver-definitions";
export { ConnectionState } from "@fluidframework/container-loader";
export {
	ContainerSchema,
	DataObjectClass,
	DOProviderContainerRuntimeFactory,
	FluidContainer,
	IConnection,
	IFluidContainer,
	IFluidContainerEvents,
	IMember,
	IRootDataObject,
	IServiceAudience,
	IServiceAudienceEvents,
	LoadableObjectClass,
	LoadableObjectClassRecord,
	LoadableObjectCtor,
	LoadableObjectRecord,
	MemberChangedListener,
	RootDataObject,
	RootDataObjectProps,
	ServiceAudience,
	SharedObjectClass,
} from "@fluidframework/fluid-static";
export {
	DirectoryFactory,
	IDirectory,
	IDirectoryClearOperation,
	IDirectoryCreateSubDirectoryOperation,
	IDirectoryDataObject,
	IDirectoryDeleteOperation,
	IDirectoryDeleteSubDirectoryOperation,
	IDirectoryEvents,
	IDirectoryKeyOperation,
	IDirectoryNewStorageFormat,
	IDirectoryOperation,
	IDirectorySetOperation,
	IDirectoryStorageOperation,
	IDirectorySubDirectoryOperation,
	IDirectoryValueChanged,
	ILocalValue,
	ISerializableValue,
	ISerializedValue,
	ISharedDirectory,
	ISharedDirectoryEvents,
	ISharedMap,
	ISharedMapEvents,
	IValueChanged,
	LocalValueMaker,
	MapFactory,
	SharedDirectory,
	SharedMap,
} from "@fluidframework/map";
export {
	CompressedSerializedInterval,
	DeserializeCallback,
	getTextAndMarkers,
	IInterval,
	IIntervalCollectionEvent,
	IIntervalHelpers,
	IJSONRunSegment,
	IMapMessageLocalMetadata,
	Interval,
	IntervalCollection,
	IntervalCollectionIterator,
	IntervalConflictResolver,
	IntervalLocator,
	intervalLocatorFromEndpoint,
	IntervalType,
	ISequenceDeltaRange,
	ISerializableInterval,
	ISerializedInterval,
	ISerializedIntervalCollectionV2,
	ISharedIntervalCollection,
	ISharedSegmentSequenceEvents,
	ISharedString,
	IValueOpEmitter,
	SequenceDeltaEvent,
	SequenceEvent,
	SequenceInterval,
	SequenceMaintenanceEvent,
	SerializedIntervalDelta,
	SharedIntervalCollection,
	SharedIntervalCollectionFactory,
	SharedSegmentSequence,
	SharedSequence,
	SharedString,
	SharedStringFactory,
	SharedStringSegment,
	SubSequence,
} from "@fluidframework/sequence";
