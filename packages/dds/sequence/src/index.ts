/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Supports distributed data structures which are list-like.
 *
 * This package's main export is {@link SharedSequence}, a DDS for storing and simultaneously editing a sequence of
 * text.
 *
 * @remarks Note that SharedString is a sequence DDS but it has additional specialized features and behaviors for
 * working with text.
 *
 * @packageDocumentation
 */

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
    SerializedIntervalDelta,
} from "./intervalCollection";
export {
    IMapMessageLocalMetadata,
    IValueOpEmitter,
} from "./defaultMapInterfaces";
export {
    ISharedString,
    SharedStringSegment,
    SharedString,
    getTextAndMarkers,
} from "./sharedString";
export {
    SharedSegmentSequence,
    ISharedSegmentSequenceEvents,
} from "./sequence";
export { SharedStringFactory } from "./sequenceFactory";
export {
    SequenceEvent,
    SequenceDeltaEvent,
    SequenceMaintenanceEvent,
    ISequenceDeltaRange,
} from "./sequenceDeltaEvent";
export {
    IJSONRunSegment,
    SubSequence,
    SharedSequence,
} from "./sharedSequence";
export {
    SharedIntervalCollectionFactory,
    ISharedIntervalCollection,
    SharedIntervalCollection,
} from "./sharedIntervalCollection";
export {
    IInterval,
    IntervalConflictResolver,
} from "./intervalTree";
