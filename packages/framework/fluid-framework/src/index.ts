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

export { AttachState } from "@fluidframework/container-definitions";
export { ConnectionState } from "@fluidframework/container-loader";
export {
    IFluidContainerEvents,
    IFluidContainer,
    FluidContainer,
    RootDataObjectProps,
    RootDataObject,
    DOProviderContainerRuntimeFactory,
    ServiceAudience,
    LoadableObjectRecord,
    LoadableObjectClassRecord,
    LoadableObjectClass,
    DataObjectClass,
    SharedObjectClass,
    LoadableObjectCtor,
    ContainerSchema,
    MemberChangedListener,
    IServiceAudienceEvents,
    IServiceAudience,
    IConnection,
    IMember,
} from "@fluidframework/fluid-static";
export {
    LocalValueMaker,
    ILocalValue,
    IValueChanged,
    IDirectory,
    ISharedDirectoryEvents,
    IDirectoryEvents,
    ISharedDirectory,
    IDirectoryValueChanged,
    ISharedMapEvents,
    ISharedMap,
    ISerializableValue,
    ISerializedValue,
    MapFactory,
    SharedMap,
    IDirectorySetOperation,
    IDirectoryDeleteOperation,
    IDirectoryKeyOperation,
    IDirectoryClearOperation,
    IDirectoryStorageOperation,
    IDirectoryCreateSubDirectoryOperation,
    IDirectoryDeleteSubDirectoryOperation,
    IDirectorySubDirectoryOperation,
    IDirectoryOperation,
    IDirectoryDataObject,
    IDirectoryNewStorageFormat,
    DirectoryFactory,
    SharedDirectory,
} from "@fluidframework/map";
export {
    DeserializeCallback,
    IIntervalCollectionEvent,
    IIntervalHelpers,
    Interval,
    IntervalCollection,
    IntervalCollectionIterator,
    IntervalLocator,
    intervalLocatorFromEndpoint,
    IntervalType,
    ISerializableInterval,
    ISerializedInterval,
    SequenceInterval,
    ISerializedIntervalCollectionV2,
    CompressedSerializedInterval,
    IMapMessageLocalMetadata,
    IValueOpEmitter,
    getTextAndMarkers,
    ISharedString,
    SharedStringSegment,
    SharedString,
    ISharedSegmentSequenceEvents,
    SharedSegmentSequence,
    SharedStringFactory,
    SequenceEvent,
    SequenceDeltaEvent,
    SequenceMaintenanceEvent,
    ISequenceDeltaRange,
    IJSONRunSegment,
    SubSequence,
    SharedSequence,
    SharedIntervalCollectionFactory,
    ISharedIntervalCollection,
    SharedIntervalCollection,
} from "@fluidframework/sequence";
