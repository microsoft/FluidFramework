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
export { SequenceOptions } from "./intervalCollectionMapInterfaces.js";
export {
	IInterval,
	IntervalOpType,
	IntervalType,
	ISerializableInterval,
	ISerializedInterval,
	SequenceInterval,
	SerializedIntervalDelta,
	IntervalStickiness,
} from "./intervals/index.js";
export {
	DeserializeCallback,
	ISequenceIntervalCollection,
	ISequenceIntervalCollectionEvents,
} from "./intervalCollection.js";
export {
	SequenceIntervalIndex,
	SequenceIntervalIndexes,
	ISequenceOverlappingIntervalsIndex,
	IEndpointIndex,
	createOverlappingIntervalsIndex,
	createEndpointIndex,
} from "./intervalIndex/index.js";
export {
	appendAddIntervalToRevertibles,
	appendChangeIntervalToRevertibles,
	appendDeleteIntervalToRevertibles,
	appendIntervalPropertyChangedToRevertibles,
	appendSharedStringDeltaToRevertibles,
	discardSharedStringRevertibles,
	IntervalRevertible,
	revertSharedStringRevertibles,
	SharedStringRevertible,
} from "./revertibles.js";
export {
	ISharedSegmentSequenceEvents,
	SharedSegmentSequence,
	ISharedSegmentSequence,
} from "./sequence.js";
export {
	ISequenceDeltaRange,
	SequenceDeltaEvent,
	SequenceEvent,
	SequenceMaintenanceEvent,
} from "./sequenceDeltaEvent.js";
export { SharedString } from "./sequenceFactory.js";
export {
	getTextAndMarkers,
	ISharedString,
	SharedStringSegment,
	SharedStringClass,
} from "./sharedString.js";
export { IJSONRunSegment, SharedSequence, SubSequence } from "./sharedSequence.js";

export {
	ISegment,
	Marker,
	BaseSegment,
	ReferencePosition,
	ReferenceType,
	PropertySet,
	MapLike,
	TextSegment,
	MergeTreeDeltaType,
	reservedMarkerIdKey,
	reservedTileLabelsKey,
	reservedRangeLabelsKey,
	TrackingGroup,
	LocalReferencePosition,
	Side,
	InteriorSequencePlace,
	SequencePlace,
} from "@fluidframework/merge-tree/internal";
