/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type IInterval,
	type ISerializedInterval,
	type ISerializableInterval,
	IntervalOpType,
	IntervalType,
	IntervalDeltaOpType,
	IntervalStickiness,
	type SerializedIntervalDelta,
	type CompressedSerializedInterval,
	endReferenceSlidingPreference,
	startReferenceSlidingPreference,
} from "./intervalUtils.js";
export {
	type SequenceInterval,
	SequenceIntervalClass,
	BaseSequenceInterval,
	createSequenceInterval,
	createPositionReferenceFromSegoff,
	createTransientIntervalFromSequence,
	resolvePositionRef,
	getSerializedProperties,
} from "./sequenceInterval.js";
