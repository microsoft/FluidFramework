/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	BaseSegment,
	ISegment,
	InteriorSequencePlace,
	LocalReferencePosition,
	MapLike,
	Marker,
	MergeTreeDeltaType,
	PropertySet,
	ReferencePosition,
	ReferenceType,
	SequencePlace,
	Side,
	TextSegment,
	TrackingGroup,
	reservedMarkerIdKey,
	reservedRangeLabelsKey,
	reservedTileLabelsKey,
} from "@fluidframework/merge-tree/internal";

export {
	DeserializeCallback,
	ISequenceIntervalCollection,
	ISequenceIntervalCollectionEvents,
} from "./intervalCollection.js";
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
	IEndpointIndex,
	ISequenceOverlappingIntervalsIndex,
	SequenceIntervalIndex,
	SequenceIntervalIndexes,
	createEndpointIndex,
	createOverlappingIntervalsIndex,
} from "./intervalIndex/index.js";
export {
	IInterval,
	ISerializedInterval,
	IntervalOpType,
	IntervalStickiness,
	IntervalType,
	SequenceInterval,
	SerializedIntervalDelta,
} from "./intervals/index.js";
export {
	IntervalRevertible,
	SharedStringRevertible,
	appendAddIntervalToRevertibles,
	appendChangeIntervalToRevertibles,
	appendDeleteIntervalToRevertibles,
	appendIntervalPropertyChangedToRevertibles,
	appendSharedStringDeltaToRevertibles,
	discardSharedStringRevertibles,
	revertSharedStringRevertibles,
} from "./revertibles.js";
export {
	ISharedSegmentSequence,
	ISharedSegmentSequenceEvents,
	SharedSegmentSequence,
} from "./sequence.js";
export {
	ISequenceDeltaRange,
	SequenceDeltaEvent,
	SequenceEvent,
	SequenceMaintenanceEvent,
} from "./sequenceDeltaEvent.js";
export { SharedString } from "./sequenceFactory.js";
export { IJSONRunSegment, SharedSequence, SubSequence } from "./sharedSequence.js";
export {
	ISharedString,
	SharedStringClass,
	SharedStringSegment,
	getTextAndMarkers,
} from "./sharedString.js";
