/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import {
	Client,
	ICombiningOp,
	ISegment,
	LocalReferencePosition,
	PropertiesManager,
	PropertySet,
	ReferenceType,
	SlidingPreference,
	compareReferencePositions,
	createDetachedLocalReferencePosition,
	createMap,
	getSlideToSegoff,
	maxReferencePosition,
	minReferencePosition,
	refTypeIncludesFlag,
	reservedRangeLabelsKey,
} from "@fluidframework/merge-tree";
import { assert } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { UsageError } from "@fluidframework/container-utils";
import { Side } from "../intervalCollection";
import {
	IIntervalHelpers,
	ISerializableInterval,
	ISerializedInterval,
	IntervalStickiness,
	IntervalType,
	endReferenceSlidingPreference,
	startReferenceSlidingPreference,
} from "./intervalUtils";

const reservedIntervalIdKey = "intervalId";

/**
 * Interval implementation whose ends are associated with positions in a mutatable sequence.
 * As such, when content is inserted into the middle of the interval, the interval expands to
 * include that content.
 *
 * @remarks - The endpoint's position should be treated exclusively to get reasonable behavior--i.e.
 * an interval referring to "hello" in "hello world" should have a start position of 0 and an end
 * position of 5.
 *
 * To see why, consider what happens if "llo wor" is removed from the string to make "held".
 * The interval's startpoint remains on the "h" (it isn't altered), but the interval's endpoint
 * slides forward to the next unremoved position, which is the "l" in "held".
 * Users would generally expect the interval to now refer to "he" (as it is the subset of content
 * remaining after the removal), hence the "l" should be excluded.
 * If the interval endpoint was treated inclusively, the interval would now refer to "hel", which
 * is undesirable.
 *
 * Since the end of an interval is treated exclusively but cannot be greater than or equal to the
 * length of the associated sequence, there exist special endpoint segments, "start" and "end",
 * which represent the position immediately before or immediately after the string respectively.
 *
 * If a `SequenceInterval` is created with `canSlideToEndpoint` set to true, the
 * endpoints of the interval that are sticky will be automatically created as
 * exclusive and will have the ability to slide to these special endpoint
 * segments.
 */
export class SequenceInterval implements ISerializableInterval {
	/**
	 * {@inheritDoc ISerializableInterval.properties}
	 */
	public properties: PropertySet;
	/**
	 * {@inheritDoc ISerializableInterval.propertyManager}
	 * @internal
	 */
	public propertyManager: PropertiesManager;

	constructor(
		private readonly client: Client,
		/**
		 * Start endpoint of this interval.
		 * @remarks - This endpoint can be resolved into a character position using the SharedString it's a part of.
		 */
		public start: LocalReferencePosition,
		/**
		 * End endpoint of this interval.
		 * @remarks - This endpoint can be resolved into a character position using the SharedString it's a part of.
		 */
		public end: LocalReferencePosition,
		public intervalType: IntervalType,
		props?: PropertySet,
		public readonly stickiness: IntervalStickiness = IntervalStickiness.END,
		public readonly canSlideToEndpoint: boolean = false,
		public readonly startSide: Side = Side.Before,
		public readonly endSide: Side = Side.After,
	) {
		this.propertyManager = new PropertiesManager();
		this.properties = {};

		if (props) {
			this.addProperties(props);
		}
	}

	private callbacks?: Record<"beforePositionChange" | "afterPositionChange", () => void>;

	/**
	 * Subscribes to position change events on this interval if there are no current listeners.
	 * @internal
	 */
	public addPositionChangeListeners(
		beforePositionChange: () => void,
		afterPositionChange: () => void,
	): void {
		if (this.callbacks === undefined) {
			this.callbacks = {
				beforePositionChange,
				afterPositionChange,
			};

			const startCbs = (this.start.callbacks ??= {});
			const endCbs = (this.end.callbacks ??= {});
			startCbs.beforeSlide = endCbs.beforeSlide = beforePositionChange;
			startCbs.afterSlide = endCbs.afterSlide = afterPositionChange;
		}
	}

	/**
	 * Removes the currently subscribed position change listeners.
	 * @internal
	 */
	public removePositionChangeListeners(): void {
		if (this.callbacks) {
			this.callbacks = undefined;
			this.start.callbacks = undefined;
			this.end.callbacks = undefined;
		}
	}

	/**
	 * {@inheritDoc ISerializableInterval.serialize}
	 * @internal
	 */
	public serialize(): ISerializedInterval {
		const startPosition = this.client.localReferencePositionToPosition(this.start);
		const endPosition = this.client.localReferencePositionToPosition(this.end);
		const serializedInterval: ISerializedInterval = {
			end: endPosition,
			intervalType: this.intervalType,
			sequenceNumber: this.client.getCurrentSeq(),
			start: startPosition,
			stickiness: this.stickiness,
			canSlideToEndpoint: this.canSlideToEndpoint,
			startSide: this.startSide,
			endSide: this.endSide,
		};

		if (this.properties) {
			serializedInterval.properties = this.properties;
		}
		if (this.stickiness !== IntervalStickiness.END) {
			serializedInterval.stickiness = this.stickiness;
		}

		return serializedInterval;
	}

	/**
	 * {@inheritDoc IInterval.clone}
	 */
	public clone() {
		return new SequenceInterval(
			this.client,
			this.start,
			this.end,
			this.intervalType,
			this.properties,
			this.stickiness,
			this.canSlideToEndpoint,
			this.startSide,
			this.endSide,
		);
	}

	/**
	 * {@inheritDoc IInterval.compare}
	 */
	public compare(b: SequenceInterval) {
		const startResult = this.compareStart(b);
		if (startResult === 0) {
			const endResult = this.compareEnd(b);
			if (endResult === 0) {
				const thisId = this.getIntervalId();
				if (thisId) {
					const bId = b.getIntervalId();
					if (bId) {
						return thisId > bId ? 1 : thisId < bId ? -1 : 0;
					}
					return 0;
				}
				return 0;
			} else {
				return endResult;
			}
		} else {
			return startResult;
		}
	}

	/**
	 * {@inheritDoc IInterval.compareStart}
	 */
	public compareStart(b: SequenceInterval) {
		const dist = compareReferencePositions(this.start, b.start);
		if (dist !== 0 || this.startSide === b.startSide) {
			return dist;
		}

		if (this.startSide === Side.Before) {
			return 1;
		}

		return -1;
	}

	/**
	 * {@inheritDoc IInterval.compareEnd}
	 */
	public compareEnd(b: SequenceInterval): number {
		const dist = compareReferencePositions(this.end, b.end);
		if (dist !== 0 || this.endSide === b.endSide) {
			return dist;
		}

		if (this.endSide === Side.Before) {
			return 1;
		}

		return -1;
	}

	/**
	 * {@inheritDoc IInterval.overlaps}
	 */
	public overlaps(b: SequenceInterval) {
		// todo: account for side
		const result =
			compareReferencePositions(this.start, b.end) <= 0 &&
			compareReferencePositions(this.end, b.start) >= 0;
		return result;
	}

	/**
	 * {@inheritDoc ISerializableInterval.getIntervalId}
	 */
	public getIntervalId(): string {
		const id = this.properties?.[reservedIntervalIdKey];
		assert(id !== undefined, 0x5e2 /* interval ID should not be undefined */);
		return `${id}`;
	}

	/**
	 * {@inheritDoc IInterval.union}
	 * @internal
	 */
	public union(b: SequenceInterval) {
		const newStart = minReferencePosition(this.start, b.start);
		const newEnd = maxReferencePosition(this.end, b.end);

		return new SequenceInterval(
			this.client,
			newStart,
			newEnd,
			this.intervalType,
			undefined,
			// todo: not happy with how merging here works
			(this.stickiness | b.stickiness) as IntervalStickiness,
			this.canSlideToEndpoint || b.canSlideToEndpoint,
			this.start === newStart ? this.startSide : b.startSide,
			this.end === newEnd ? this.endSide : b.endSide,
		);
	}

	/**
	 * {@inheritDoc ISerializableInterval.addProperties}
	 * @internal
	 */
	public addProperties(
		newProps: PropertySet,
		collab: boolean = false,
		seq?: number,
		op?: ICombiningOp,
	): PropertySet | undefined {
		this.initializeProperties();
		return this.propertyManager.addProperties(this.properties, newProps, op, seq, collab);
	}

	/**
	 * @returns whether this interval overlaps two numerical positions.
	 */
	public overlapsPos(bstart: number, bend: number) {
		const startPos = this.client.localReferencePositionToPosition(this.start);
		const endPos = this.client.localReferencePositionToPosition(this.end);
		return endPos > bstart && startPos < bend;
	}

	/**
	 * {@inheritDoc IInterval.modify}
	 * @internal
	 */
	public modify(
		label: string,
		start: number,
		end: number,
		op?: ISequencedDocumentMessage,
		localSeq?: number,
	) {
		const getRefType = (baseType: ReferenceType): ReferenceType => {
			let refType = baseType;
			if (op === undefined) {
				refType &= ~ReferenceType.SlideOnRemove;
				refType |= ReferenceType.StayOnRemove;
			}
			return refType;
		};

		let startRef = this.start;
		if (start !== undefined) {
			startRef = createPositionReference(
				this.client,
				start,
				getRefType(this.start.refType),
				op,
				undefined,
				localSeq,
				startReferenceSlidingPreference(this.stickiness),
				this.canSlideToEndpoint &&
					startReferenceSlidingPreference(this.stickiness) === SlidingPreference.BACKWARD,
			);
			if (this.start.properties) {
				startRef.addProperties(this.start.properties);
			}
		}

		let endRef = this.end;
		if (end !== undefined) {
			endRef = createPositionReference(
				this.client,
				end,
				getRefType(this.end.refType),
				op,
				undefined,
				localSeq,
				endReferenceSlidingPreference(this.stickiness),
				this.canSlideToEndpoint &&
					endReferenceSlidingPreference(this.stickiness) === SlidingPreference.FORWARD,
			);
			if (this.end.properties) {
				endRef.addProperties(this.end.properties);
			}
		}

		const newInterval = new SequenceInterval(
			this.client,
			startRef,
			endRef,
			this.intervalType,
			undefined,
			this.stickiness,
			this.canSlideToEndpoint,
			this.startSide,
			this.endSide,
		);
		if (this.properties) {
			newInterval.initializeProperties();
			this.propertyManager.copyTo(
				this.properties,
				newInterval.properties,
				newInterval.propertyManager,
			);
		}
		return newInterval;
	}

	private initializeProperties(): void {
		if (!this.propertyManager) {
			this.propertyManager = new PropertiesManager();
		}
		if (!this.properties) {
			this.properties = createMap<any>();
		}
	}
}

export function createPositionReferenceFromSegoff(
	client: Client,
	segoff: { segment: ISegment | undefined; offset: number | undefined } | "start" | "end",
	refType: ReferenceType,
	op?: ISequencedDocumentMessage,
	localSeq?: number,
	fromSnapshot?: boolean,
	slidingPreference?: SlidingPreference,
	canSlideToEndpoint?: boolean,
): LocalReferencePosition {
	if (segoff === "start" || segoff === "end") {
		return client.createLocalReferencePosition(
			segoff,
			undefined,
			refType,
			undefined,
			slidingPreference,
			canSlideToEndpoint,
		);
	}

	if (segoff.segment) {
		const ref = client.createLocalReferencePosition(
			segoff.segment,
			segoff.offset,
			refType,
			undefined,
			slidingPreference,
			canSlideToEndpoint,
		);
		return ref;
	}

	// Creating references on detached segments is allowed for:
	// - Transient segments
	// - References coming from a remote client (location may have been concurrently removed)
	// - References being rebased to a new sequence number
	//   (segment they originally referred to may have been removed with no suitable replacement)
	if (
		!op &&
		!localSeq &&
		!fromSnapshot &&
		!refTypeIncludesFlag(refType, ReferenceType.Transient)
	) {
		throw new UsageError("Non-transient references need segment");
	}

	return createDetachedLocalReferencePosition(refType);
}

function createPositionReference(
	client: Client,
	pos: number | "start" | "end",
	refType: ReferenceType,
	op?: ISequencedDocumentMessage,
	fromSnapshot?: boolean,
	localSeq?: number,
	slidingPreference?: SlidingPreference,
	exclusive: boolean = false,
): LocalReferencePosition {
	let segoff;

	if (op) {
		assert(
			(refType & ReferenceType.SlideOnRemove) !== 0,
			0x2f5 /* op create references must be SlideOnRemove */,
		);
		if (pos === "start" || pos === "end") {
			segoff = pos;
		} else {
			segoff = client.getContainingSegment(pos, {
				referenceSequenceNumber: op.referenceSequenceNumber,
				clientId: op.clientId,
			});
			segoff = getSlideToSegoff(segoff);
		}
	} else {
		assert(
			(refType & ReferenceType.SlideOnRemove) === 0 || !!fromSnapshot,
			0x2f6 /* SlideOnRemove references must be op created */,
		);
		segoff =
			pos === "start" || pos === "end"
				? pos
				: client.getContainingSegment(pos, undefined, localSeq);
	}

	return createPositionReferenceFromSegoff(
		client,
		segoff,
		refType,
		op,
		localSeq,
		fromSnapshot,
		slidingPreference,
		exclusive,
	);
}

export function createSequenceInterval(
	label: string,
	start: number | "start" | "end",
	end: number | "start" | "end",
	client: Client,
	intervalType: IntervalType,
	op?: ISequencedDocumentMessage,
	fromSnapshot?: boolean,
	stickiness: IntervalStickiness = IntervalStickiness.END,
	canSlideToEndpoint: boolean = false,
	startSide: Side = Side.Before,
	endSide: Side = Side.After,
): SequenceInterval {
	let beginRefType = ReferenceType.RangeBegin;
	let endRefType = ReferenceType.RangeEnd;
	if (intervalType === IntervalType.Transient) {
		beginRefType = ReferenceType.Transient;
		endRefType = ReferenceType.Transient;
	} else {
		if (intervalType === IntervalType.Nest) {
			beginRefType = ReferenceType.NestBegin;
			endRefType = ReferenceType.NestEnd;
		}
		// All non-transient interval references must eventually be SlideOnRemove
		// To ensure eventual consistency, they must start as StayOnRemove when
		// pending (created locally and creation op is not acked)
		if (op || fromSnapshot) {
			beginRefType |= ReferenceType.SlideOnRemove;
			endRefType |= ReferenceType.SlideOnRemove;
		} else {
			beginRefType |= ReferenceType.StayOnRemove;
			endRefType |= ReferenceType.StayOnRemove;
		}
	}

	const startLref = createPositionReference(
		client,
		start,
		beginRefType,
		op,
		fromSnapshot,
		undefined,
		startReferenceSlidingPreference(stickiness),
		canSlideToEndpoint &&
			startReferenceSlidingPreference(stickiness) === SlidingPreference.BACKWARD,
	);

	const endLref = createPositionReference(
		client,
		end,
		endRefType,
		op,
		fromSnapshot,
		undefined,
		endReferenceSlidingPreference(stickiness),
		canSlideToEndpoint &&
			endReferenceSlidingPreference(stickiness) === SlidingPreference.FORWARD,
	);

	const rangeProp = {
		[reservedRangeLabelsKey]: [label],
	};
	startLref.addProperties(rangeProp);
	endLref.addProperties(rangeProp);

	const ival = new SequenceInterval(
		client,
		startLref,
		endLref,
		intervalType,
		rangeProp,
		stickiness,
		canSlideToEndpoint,
		startSide,
		endSide,
	);
	return ival;
}

export const compareSequenceIntervalEnds = (a: SequenceInterval, b: SequenceInterval): number =>
	compareReferencePositions(a.end, b.end);

export const compareSequenceIntervalStarts = (a: SequenceInterval, b: SequenceInterval): number =>
	compareReferencePositions(a.start, b.start);

export const sequenceIntervalHelpers: IIntervalHelpers<SequenceInterval> = {
	compareEnds: compareSequenceIntervalEnds,
	compareStarts: compareSequenceIntervalStarts,
	create: createSequenceInterval,
};
