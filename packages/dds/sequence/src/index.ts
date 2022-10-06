/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Supports distributed data structures which are list-like.
 *
 * This library's main export is {@link SharedSequence}, a DDS for storing and simultaneously editing a sequence of
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
} from "./intervalCollection";
export {
    IMapMessageLocalMetadata,
    IValueOpEmitter,
} from "./defaultMapInterfaces";
export { getTextAndMarkers, ISharedString, SharedStringSegment, SharedString } from "./sharedString";
export { ISharedSegmentSequenceEvents, SharedSegmentSequence } from "./sequence";
export { SharedStringFactory, SharedObjectSequenceFactory, SharedNumberSequenceFactory } from "./sequenceFactory";
export { SequenceEvent, SequenceDeltaEvent, SequenceMaintenanceEvent, ISequenceDeltaRange } from "./sequenceDeltaEvent";
export { IJSONRunSegment, SubSequence, SharedSequence } from "./sharedSequence";
export { SharedObjectSequence } from "./sharedObjectSequence";
export { SharedNumberSequence } from "./sharedNumberSequence";
export {
	positionToRowCol,
	PaddingSegment,
	SparseMatrixItem,
	RunSegment,
	MatrixSegment,
	maxCol,
	maxCols,
	maxRow,
	maxRows,
	maxCellPosition,
	rowColToPosition,
	SparseMatrix,
	SparseMatrixFactory,
} from "./sparsematrix";
export {
	SharedIntervalCollectionFactory,
	ISharedIntervalCollection,
	SharedIntervalCollection,
} from "./sharedIntervalCollection";
