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
export { IMapMessageLocalMetadata, IValueOpEmitter, SequenceOptions } from "./defaultMapInterfaces";
export {
	IInterval,
	Interval,
	IntervalOpType,
	IntervalType,
	ISerializableInterval,
	ISerializedInterval,
	SequenceInterval,
	SerializedIntervalDelta,
	IntervalStickiness,
	IIntervalHelpers,
	sequenceIntervalHelpers,
} from "./intervals";
export {
	DeserializeCallback,
	IIntervalCollectionEvent,
	IIntervalCollection,
	IntervalLocator,
	intervalLocatorFromEndpoint,
	Side,
	InteriorSequencePlace,
	SequencePlace,
} from "./intervalCollection";
export {
	IntervalIndex,
	SequenceIntervalIndexes,
	IOverlappingIntervalsIndex,
	createOverlappingIntervalsIndex,
	createOverlappingSequenceIntervalsIndex,
	IEndpointInRangeIndex,
	IStartpointInRangeIndex,
	createEndpointInRangeIndex,
	createStartpointInRangeIndex,
	IIdIntervalIndex,
	createIdIntervalIndex,
	IEndpointIndex,
	createEndpointIndex,
} from "./intervalIndex";
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
} from "./revertibles";
export { ISharedSegmentSequenceEvents, SharedSegmentSequence } from "./sequence";
export {
	ISequenceDeltaRange,
	SequenceDeltaEvent,
	SequenceEvent,
	SequenceMaintenanceEvent,
} from "./sequenceDeltaEvent";
export { SharedStringFactory } from "./sequenceFactory";
export {
	getTextAndMarkers,
	ISharedString,
	SharedString,
	SharedStringSegment,
} from "./sharedString";
export {
	ISharedIntervalCollection,
	SharedIntervalCollection,
	SharedIntervalCollectionFactory,
} from "./sharedIntervalCollection";
export { IJSONRunSegment, SharedSequence, SubSequence } from "./sharedSequence";

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
} from "@fluidframework/merge-tree";
