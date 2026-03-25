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
	BaseSegment,
	type InteriorSequencePlace,
	type ISegment,
	type LocalReferencePosition,
	type MapLike,
	Marker,
	MergeTreeDeltaType,
	type PropertySet,
	type ReferencePosition,
	ReferenceType,
	reservedMarkerIdKey,
	reservedRangeLabelsKey,
	reservedTileLabelsKey,
	type SequencePlace,
	Side,
	TextSegment,
	TrackingGroup,
} from "@fluidframework/merge-tree/internal";

export type {
	DeserializeCallback,
	ISequenceIntervalCollection,
	ISequenceIntervalCollectionEvents,
} from "./intervalCollection.js";
export type { SequenceOptions } from "./intervalCollectionMapInterfaces.js";
export {
	createEndpointIndex,
	createOverlappingIntervalsIndex,
	type IEndpointIndex,
	type ISequenceOverlappingIntervalsIndex,
	type SequenceIntervalIndex,
	type SequenceIntervalIndexes,
} from "./intervalIndex/index.js";
export {
	type IInterval,
	IntervalOpType,
	IntervalStickiness,
	IntervalType,
	type ISerializedInterval,
	type SequenceInterval,
	type SerializedIntervalDelta,
} from "./intervals/index.js";
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
	type ISharedSegmentSequence,
	type ISharedSegmentSequenceEvents,
	SharedSegmentSequence,
} from "./sequence.js";
export type {
	ISequenceDeltaRange,
	SequenceDeltaEvent,
	SequenceEvent,
	SequenceMaintenanceEvent,
} from "./sequenceDeltaEvent.js";
export { SharedString } from "./sequenceFactory.js";
export { type IJSONRunSegment, SharedSequence, SubSequence } from "./sharedSequence.js";
export {
	getTextAndMarkers,
	type ISharedString,
	SharedStringClass,
	type SharedStringSegment,
} from "./sharedString.js";
