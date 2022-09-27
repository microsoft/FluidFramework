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
export * from "./sharedString";
export * from "./sequence";
export * from "./sequenceFactory";
export * from "./sequenceDeltaEvent";
export * from "./sharedSequence";
export * from "./sharedIntervalCollection";
export { IInterval, IntervalConflictResolver } from "./intervalTree";
