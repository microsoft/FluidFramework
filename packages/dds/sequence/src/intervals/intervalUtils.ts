/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import {
	// eslint-disable-next-line import/no-deprecated
	Client,
	PropertiesManager,
	PropertySet,
	SlidingPreference,
} from "@fluidframework/merge-tree";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { SequencePlace, Side } from "../intervalCollection";

/**
 * Basic interval abstraction
 * @alpha
 */
export interface IInterval {
	/**
	 * @returns a new interval object with identical semantics.
	 */
	clone(): IInterval;
	/**
	 * Compares this interval to `b` with standard comparator semantics:
	 * - returns -1 if this is less than `b`
	 * - returns 1 if this is greater than `b`
	 * - returns 0 if this is equivalent to `b`
	 * @param b - Interval to compare against
	 */
	compare(b: IInterval): number;
	/**
	 * Compares the start endpoint of this interval to `b`'s start endpoint.
	 * Standard comparator semantics apply.
	 * @param b - Interval to compare against
	 */
	compareStart(b: IInterval): number;
	/**
	 * Compares the end endpoint of this interval to `b`'s end endpoint.
	 * Standard comparator semantics apply.
	 * @param b - Interval to compare against
	 */
	compareEnd(b: IInterval): number;
	/**
	 * Modifies one or more of the endpoints of this interval, returning a new interval representing the result.
	 */
	modify(
		label: string,
		start: SequencePlace | undefined,
		end: SequencePlace | undefined,
		op?: ISequencedDocumentMessage,
		localSeq?: number,
		useNewSlidingBehavior?: boolean,
	): IInterval | undefined;
	/**
	 * @returns whether this interval overlaps with `b`.
	 * Intervals are considered to overlap if their intersection is non-empty.
	 */
	overlaps(b: IInterval): boolean;
	/**
	 * Unions this interval with `b`, returning a new interval.
	 * The union operates as a convex hull, i.e. if the two intervals are disjoint, the return value includes
	 * intermediate values between the two intervals.
	 */
	union(b: IInterval): IInterval;
}

/**
 * Values are used in persisted formats (ops) and revertibles.
 * @internal
 */
export const IntervalOpType = {
	ADD: "add",
	DELETE: "delete",
	CHANGE: "change",
	PROPERTY_CHANGED: "propertyChanged",
	POSITION_REMOVE: "positionRemove",
} as const;
/**
 * @internal
 */
export type IntervalOpType = (typeof IntervalOpType)[keyof typeof IntervalOpType];
/**
 * @alpha
 */
export enum IntervalType {
	Simple = 0x0,

	/**
	 * SlideOnRemove indicates that the ends of the interval will slide if the segment
	 * they reference is removed and acked.
	 * See `packages\dds\merge-tree\docs\REFERENCEPOSITIONS.md` for details
	 * SlideOnRemove is the default interval behavior and does not need to be specified.
	 */
	SlideOnRemove = 0x2, // SlideOnRemove is default behavior - all intervals are SlideOnRemove

	/**
	 * A temporary interval, used internally
	 * @internal
	 */
	Transient = 0x4,
}

/**
 * Serialized object representation of an interval.
 * This representation is used for ops that create or change intervals.
 * @alpha
 */
export interface ISerializedInterval {
	/**
	 * Sequence number at which `start` and `end` should be interpreted
	 *
	 * @remarks It's unclear that this is necessary to store here.
	 * This should just be the refSeq on the op that modified the interval, which should be available via other means.
	 * At the time of writing, it's not plumbed through to the reconnect/rebase code, however, which does need it.
	 */
	sequenceNumber: number;
	/** Start position of the interval */
	start: number | "start" | "end";
	/** End position of the interval */
	end: number | "start" | "end";
	/** Interval type to create */
	intervalType: IntervalType;
	/**
	 * The stickiness of this interval
	 */
	stickiness?: IntervalStickiness;
	startSide?: Side;
	endSide?: Side;
	/** Any properties the interval has */
	properties?: PropertySet;
}

/**
 * @alpha
 */
export interface ISerializableInterval extends IInterval {
	/** Serializable bag of properties associated with the interval. */
	properties: PropertySet;
	/***/
	propertyManager: PropertiesManager;
	/***/
	serialize(): ISerializedInterval;
	/***/
	addProperties(
		props: PropertySet,
		collaborating?: boolean,
		seq?: number,
	): PropertySet | undefined;
	/**
	 * Gets the id associated with this interval.
	 * When the interval is used as part of an interval collection, this id can be used to modify or remove the
	 * interval.
	 * @remarks This signature includes `undefined` strictly for backwards-compatibility reasons, as older versions
	 * of Fluid didn't always write interval ids.
	 */
	getIntervalId(): string | undefined;
}

/**
 * Represents a change that should be applied to an existing interval.
 * Changes can modify any of start/end/properties, with `undefined` signifying no change should be made.
 * @internal
 */
export type SerializedIntervalDelta = Omit<ISerializedInterval, "start" | "end" | "properties"> &
	Partial<Pick<ISerializedInterval, "start" | "end" | "properties">>;

/**
 * A size optimization to avoid redundantly storing keys when serializing intervals
 * as JSON for summaries.
 *
 * Intervals are of the format:
 *
 * [
 * start,
 * end,
 * sequenceNumber,
 * intervalType,
 * properties,
 * stickiness?,
 * startSide?,
 * endSide?,
 * ]
 */
export type CompressedSerializedInterval =
	| [
			number | "start" | "end",
			number | "start" | "end",
			number,
			IntervalType,
			PropertySet,
			IntervalStickiness,
	  ]
	| [number | "start" | "end", number | "start" | "end", number, IntervalType, PropertySet];

/**
 * @sealed
 * @deprecated The methods within have substitutions
 * @internal
 */
export interface IIntervalHelpers<TInterval extends ISerializableInterval> {
	/**
	 *
	 * @param label - label of the interval collection this interval is being added to. This parameter is
	 * irrelevant for transient intervals.
	 * @param start - numerical start position of the interval
	 * @param end - numerical end position of the interval
	 * @param client - client creating the interval
	 * @param intervalType - Type of interval to create. Default is SlideOnRemove
	 * @param op - If this create came from a remote client, op that created it. Default is undefined (i.e. local)
	 * @param fromSnapshot - If this create came from loading a snapshot. Default is false.
	 * @param startSide - The side on which the start position lays. See
	 * {@link SequencePlace} for additional context
	 * @param endSide - The side on which the end position lays. See
	 * {@link SequencePlace} for additional context
	 */
	create(
		label: string,
		start: SequencePlace | undefined,
		end: SequencePlace | undefined,
		// eslint-disable-next-line import/no-deprecated
		client: Client | undefined,
		intervalType: IntervalType,
		op?: ISequencedDocumentMessage,
		fromSnapshot?: boolean,
		useNewSlidingBehavior?: boolean,
	): TInterval;
}

/**
 * Determines how an interval should expand when segments are inserted adjacent
 * to the range it spans
 *
 * Note that interval stickiness is currently an experimental feature and must
 * be explicitly enabled with the `intervalStickinessEnabled` flag
 *
 * @alpha
 */
export const IntervalStickiness = {
	/**
	 * Interval does not expand to include adjacent segments
	 */
	NONE: 0b00,

	/**
	 * Interval expands to include segments inserted adjacent to the start
	 */
	START: 0b01,

	/**
	 * Interval expands to include segments inserted adjacent to the end
	 *
	 * This is the default stickiness
	 */
	END: 0b10,

	/**
	 * Interval expands to include all segments inserted adjacent to it
	 */
	FULL: 0b11,
} as const;

/**
 * Determines how an interval should expand when segments are inserted adjacent
 * to the range it spans
 *
 * Note that interval stickiness is currently an experimental feature and must
 * be explicitly enabled with the `intervalStickinessEnabled` flag
 * @alpha
 */
export type IntervalStickiness = (typeof IntervalStickiness)[keyof typeof IntervalStickiness];

export function startReferenceSlidingPreference(stickiness: IntervalStickiness): SlidingPreference {
	// if any start stickiness, prefer sliding backwards
	return (stickiness & IntervalStickiness.START) === 0
		? SlidingPreference.FORWARD
		: SlidingPreference.BACKWARD;
}

export function endReferenceSlidingPreference(stickiness: IntervalStickiness): SlidingPreference {
	// if any end stickiness, prefer sliding forwards
	return (stickiness & IntervalStickiness.END) === 0
		? SlidingPreference.BACKWARD
		: SlidingPreference.FORWARD;
}
