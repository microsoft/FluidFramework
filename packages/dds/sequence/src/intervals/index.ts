/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	IInterval,
	ISerializedInterval,
	ISerializableInterval,
	IntervalOpType,
	IntervalType,
	IntervalDeltaOpType,
	IntervalStickiness,
	SerializedIntervalDelta,
	CompressedSerializedInterval,
	endReferenceSlidingPreference,
	startReferenceSlidingPreference,
} from "./intervalUtils.js";
export {
	SequenceInterval,
	SequenceIntervalClass,
	createSequenceInterval,
	createPositionReferenceFromSegoff,
} from "./sequenceInterval.js";
