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
export type { SequenceOptions } from "./intervalCollectionMapInterfaces.js";
export {
	type IInterval,
	IntervalOpType,
	IntervalType,
	type ISerializedInterval,
	type SequenceInterval,
	type SerializedIntervalDelta,
	IntervalStickiness,
} from "./intervals/index.js";
export type {
	DeserializeCallback,
	ISequenceIntervalCollection,
	ISequenceIntervalCollectionEvents,
} from "./intervalCollection.js";
export {
	type SequenceIntervalIndex,
	type SequenceIntervalIndexes,
	type ISequenceOverlappingIntervalsIndex,
	type IEndpointIndex,
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
	type IntervalRevertible,
	revertSharedStringRevertibles,
	type SharedStringRevertible,
} from "./revertibles.js";
export {
	type ISharedSegmentSequenceEvents,
	SharedSegmentSequence,
	type ISharedSegmentSequence,
} from "./sequence.js";
export type {
	ISequenceDeltaRange,
	SequenceDeltaEvent,
	SequenceEvent,
	SequenceMaintenanceEvent,
} from "./sequenceDeltaEvent.js";
export { SharedString } from "./sequenceFactory.js";
export {
	getTextAndMarkers,
	type ISharedString,
	type SharedStringSegment,
	SharedStringClass,
} from "./sharedString.js";
export { type IJSONRunSegment, SharedSequence, SubSequence } from "./sharedSequence.js";

export {
	type ISegment,
	Marker,
	BaseSegment,
	type ReferencePosition,
	ReferenceType,
	type PropertySet,
	type MapLike,
	TextSegment,
	MergeTreeDeltaType,
	reservedMarkerIdKey,
	reservedTileLabelsKey,
	reservedRangeLabelsKey,
	TrackingGroup,
	type LocalReferencePosition,
	Side,
	type InteriorSequencePlace,
	type SequencePlace,
} from "@fluidframework/merge-tree/internal";
