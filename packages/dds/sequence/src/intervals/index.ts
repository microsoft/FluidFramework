/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type CompressedSerializedInterval,
	endReferenceSlidingPreference,
	type IInterval,
	IntervalDeltaOpType,
	IntervalOpType,
	IntervalStickiness,
	IntervalType,
	type ISerializableInterval,
	type ISerializedInterval,
	type SerializedIntervalDelta,
	startReferenceSlidingPreference,
} from "./intervalUtils.js";
export {
	BaseSequenceInterval,
	createPositionReferenceFromSegoff,
	createSequenceInterval,
	createTransientIntervalFromSequence,
	getSerializedProperties,
	resolvePositionRef,
	type SequenceInterval,
	SequenceIntervalClass,
} from "./sequenceInterval.js";
