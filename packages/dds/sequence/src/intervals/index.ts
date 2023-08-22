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
	IIntervalHelpers,
	IntervalStickiness,
	SerializedIntervalDelta,
	CompressedSerializedInterval,
	endReferenceSlidingPreference,
	startReferenceSlidingPreference,
} from "./intervalUtils";
export { Interval, createInterval, intervalHelpers } from "./interval";
export {
	SequenceInterval,
	createSequenceInterval,
	createPositionReferenceFromSegoff,
	sequenceIntervalHelpers,
} from "./sequenceInterval";
