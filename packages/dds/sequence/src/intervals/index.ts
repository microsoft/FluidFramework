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
	IIntervalHelpers,
	IntervalStickiness,
	SerializedIntervalDelta,
	CompressedSerializedInterval,
	endReferenceSlidingPreference,
	startReferenceSlidingPreference,
} from "./intervalUtils.js";
export { Interval, createInterval, intervalHelpers } from "./interval.js";
export {
	SequenceInterval,
	createSequenceInterval,
	createPositionReferenceFromSegoff,
	sequenceIntervalHelpers,
} from "./sequenceInterval.js";
