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
    IntervalType,
    ISerializableInterval,
    ISerializedInterval,
    SequenceInterval,
    ISerializedIntervalCollectionV2,
    CompressedSerializedInterval,
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
export * from "./sharedObjectSequence";
export * from "./sharedNumberSequence";
export * from "./sparsematrix";
export * from "./sharedIntervalCollection";
