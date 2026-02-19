/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	CompressedSerializedInterval,
	IInterval,
	ISerializableInterval,
	ISerializedInterval,
	IntervalDeltaOpType,
	IntervalOpType,
	IntervalStickiness,
	IntervalType,
	SerializedIntervalDelta,
	endReferenceSlidingPreference,
	startReferenceSlidingPreference,
} from "./intervalUtils.js";
export {
	SequenceInterval,
	SequenceIntervalClass,
	createPositionReferenceFromSegoff,
	createSequenceInterval,
	createTransientInterval,
	getSerializedProperties,
} from "./sequenceInterval.js";
