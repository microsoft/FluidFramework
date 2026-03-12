/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	CompressedSerializedInterval,
	endReferenceSlidingPreference,
	IInterval,
	IntervalDeltaOpType,
	IntervalOpType,
	IntervalStickiness,
	IntervalType,
	ISerializableInterval,
	ISerializedInterval,
	SerializedIntervalDelta,
	startReferenceSlidingPreference,
} from "./intervalUtils.js";
export {
	BaseSequenceInterval,
	createPositionReferenceFromSegoff,
	createSequenceInterval,
	createTransientIntervalFromSequence,
	getSerializedProperties,
	resolvePositionRef,
	SequenceInterval,
	SequenceIntervalClass,
} from "./sequenceInterval.js";
