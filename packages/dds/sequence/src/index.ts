/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The **\@fluidframework/sequence** packages supports distributed data structures which are list-like.
 * It includes {@link https://fluidframework.com/docs/data-structures/string/ | SharedString} for storing
 * and simultaneously editing a sequence of text.
 *
 * @see {@link https://github.com/microsoft/FluidFramework/blob/main/packages/dds/sequence/README.md}.
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
    ISequenceIntervalEvents,
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
