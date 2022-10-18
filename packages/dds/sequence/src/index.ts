/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Supports distributed data structures which are list-like.
 *
 * This library's main export is {@link SharedString}, a DDS for storing and simultaneously editing a sequence of
 * text.
 *
 * See the package's README for a high-level introduction to `SharedString`'s feature set.
 * @remarks Note that SharedString is a sequence DDS but it has additional specialized features and behaviors for
 * working with text.
 *
 * @packageDocumentation
 */
export { IMapMessageLocalMetadata, IValueOpEmitter } from "./defaultMapInterfaces";
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
export { IInterval, IntervalConflictResolver } from "./intervalTree";
export { ISharedSegmentSequenceEvents, SharedSegmentSequence } from "./sequence";
export { ISequenceDeltaRange, SequenceDeltaEvent, SequenceEvent, SequenceMaintenanceEvent } from "./sequenceDeltaEvent";
export { SharedStringFactory } from "./sequenceFactory";
export { getTextAndMarkers, ISharedString, SharedString, SharedStringSegment } from "./sharedString";
export {
	ISharedIntervalCollection,
	SharedIntervalCollection,
	SharedIntervalCollectionFactory,
} from "./sharedIntervalCollection";
export { IJSONRunSegment, SharedSequence, SubSequence } from "./sharedSequence";
