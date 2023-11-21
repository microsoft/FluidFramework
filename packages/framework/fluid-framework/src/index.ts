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

export { AttachState, ContainerErrorType } from "@fluidframework/container-definitions";
export { DriverErrorType, DriverErrorTypes } from "@fluidframework/driver-definitions";
export { ConnectionState } from "@fluidframework/container-loader";
export type {
	ContainerSchema,
	DataObjectClass,
	IConnection,
	IFluidContainer,
	IFluidContainerEvents,
	IMember,
	InitialObjects,
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
} from "@fluidframework/fluid-static";
export {
	/**
	 * @deprecated No intended replacement in this package.
	 */
	DOProviderContainerRuntimeFactory,
	/**
	 * @deprecated No intended replacement in this package.
	 */
	FluidContainer,
	/**
	 * @deprecated No intended replacement in this package.
	 */
	ServiceAudience,
} from "@fluidframework/fluid-static";
export type {
	ICreateInfo,
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
} from "@fluidframework/map";
export {
	DirectoryFactory,
	LocalValueMaker,
	MapFactory,
	SharedDirectory,
	SharedMap,
} from "@fluidframework/map";
export type {
	DeserializeCallback,
	IInterval,
	IIntervalCollectionEvent,
	IIntervalHelpers,
	IJSONRunSegment,
	IMapMessageLocalMetadata,
	InteriorSequencePlace,
	IIntervalCollection,
	IntervalIndex,
	IntervalLocator,
	IntervalOpType,
	IntervalStickiness,
	ISequenceDeltaRange,
	ISerializableInterval,
	ISerializedInterval,
	ISharedIntervalCollection,
	ISharedSegmentSequenceEvents,
	ISharedString,
	IValueOpEmitter,
	SequencePlace,
	SerializedIntervalDelta,
	SharedStringSegment,
	Side,
} from "@fluidframework/sequence";
export {
	getTextAndMarkers,
	Interval,
	intervalLocatorFromEndpoint,
	IntervalType,
	SequenceDeltaEvent,
	SequenceEvent,
	SequenceInterval,
	SequenceMaintenanceEvent,
	SharedIntervalCollection,
	SharedIntervalCollectionFactory,
	SharedSegmentSequence,
	SharedSequence,
	SharedString,
	SharedStringFactory,
	SubSequence,
} from "@fluidframework/sequence";
