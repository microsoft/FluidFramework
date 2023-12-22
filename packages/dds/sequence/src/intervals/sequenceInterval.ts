/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */
/* eslint-disable import/no-deprecated */

import {
	Client,
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
import { assert } from "@fluidframework/core-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { UsageError } from "@fluidframework/telemetry-utils";
import {
	SequencePlace,
	Side,
	computeStickinessFromSide,
	endpointPosAndSide,
	sidesFromStickiness,
} from "../intervalCollection";
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

function compareSides(sideA: Side, sideB: Side): number {
	if (sideA === sideB) {
		return 0;
	}

	if (sideA === Side.Before) {
		return 1;
	}

	return -1;
}

function minSide(sideA: Side, sideB: Side): Side {
	if (sideA === Side.After && sideB === Side.After) {
		return Side.After;
	}

	return Side.Before;
}

function maxSide(sideA: Side, sideB: Side): Side {
	if (sideA === Side.Before && sideB === Side.Before) {
		return Side.Before;
	}

	return Side.After;
}

/**
 * Interval implementation whose ends are associated with positions in a mutatable sequence.
 * As such, when content is inserted into the middle of the interval, the interval expands to
 * include that content.
 *
 * @remarks The endpoints' positions should be treated exclusively to get
 * reasonable behavior. E.g., an interval referring to "hello" in "hello world"
 * should have a start position of 0 and an end position of 5.
 *
 * To see why, consider what happens if "llo wor" is removed from the string to make "held".
 * The interval's startpoint remains on the "h" (it isn't altered), but the interval's endpoint
 * slides forward to the next unremoved position, which is the "l" in "held".
 * Users would generally expect the interval to now refer to "he" (as it is the subset of content
 * remaining after the removal), hence the "l" should be excluded.
 * If the interval endpoint was treated inclusively, the interval would now refer to "hel", which
 * is undesirable.
 *
 * Since the endpoints of an interval are treated exclusively but cannot be greater
 * than or equal to the length of the associated sequence, there exist special
 * endpoint segments, "start" and "end", which represent the position immediately
 * before or immediately after the string respectively.
 *
 * If a `SequenceInterval` is created on a sequence with the
 * `mergeTreeReferencesCanSlideToEndpoint` feature flag set to true, the endpoints
 * of the interval that are exclusive will have the ability to slide to these
 * special endpoint segments.
 * @alpha
 */
export class SequenceInterval implements ISerializableInterval {
	/**
	 * {@inheritDoc ISerializableInterval.properties}
	 */
	public properties: PropertySet = createMap<any>();

	/**
	 * {@inheritDoc ISerializableInterval.propertyManager}
	 */
	public propertyManager: PropertiesManager = new PropertiesManager();

	/***/
	public get stickiness(): IntervalStickiness {
		const startSegment = this.start.getSegment();
		const endSegment = this.end.getSegment();
		return computeStickinessFromSide(
			startSegment?.endpointType,
			this.startSide,
			endSegment?.endpointType,
			this.endSide,
		);
	}

	constructor(
		private readonly client: Client,
		/**
		 * Start endpoint of this interval.
		 * @remarks This endpoint can be resolved into a character position using the SharedString it's a part of.
		 */
		public start: LocalReferencePosition,
		/**
		 * End endpoint of this interval.
		 * @remarks This endpoint can be resolved into a character position using the SharedString it's a part of.
		 */
		public end: LocalReferencePosition,
		public intervalType: IntervalType,
		props?: PropertySet,
		public readonly startSide: Side = Side.Before,
		public readonly endSide: Side = Side.Before,
	) {
		if (props) {
			this.addProperties(props);
		}
	}

	private callbacks?: Record<"beforePositionChange" | "afterPositionChange", () => void>;

	/**
	 * Subscribes to position change events on this interval if there are no current listeners.
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
	 */
	public serialize(): ISerializedInterval {
		const startPosition = this.client.localReferencePositionToPosition(this.start);
		const endPosition = this.client.localReferencePositionToPosition(this.end);
		const { startSide, endSide } = sidesFromStickiness(this.stickiness);
		const serializedInterval: ISerializedInterval = {
			end: endPosition,
			intervalType: this.intervalType,
			sequenceNumber: this.client.getCurrentSeq(),
			start: startPosition,
			stickiness: this.stickiness,
			startSide,
			endSide,
		};

		if (this.properties) {
			serializedInterval.properties = this.properties;
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

		if (dist === 0) {
			return compareSides(this.startSide, b.startSide);
		}

		return dist;
	}

	/**
	 * {@inheritDoc IInterval.compareEnd}
	 */
	public compareEnd(b: SequenceInterval): number {
		const dist = compareReferencePositions(this.end, b.end);

		if (dist === 0) {
			return compareSides(b.endSide, this.endSide);
		}

		return dist;
	}

	/**
	 * {@inheritDoc IInterval.overlaps}
	 */
	public overlaps(b: SequenceInterval) {
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
	 */
	public union(b: SequenceInterval) {
		const newStart = minReferencePosition(this.start, b.start);
		const newEnd = maxReferencePosition(this.end, b.end);

		let startSide: Side;

		if (this.start === b.start) {
			startSide = minSide(this.startSide, b.startSide);
		} else {
			startSide = this.start === newStart ? this.startSide : b.startSide;
		}

		let endSide: Side;

		if (this.end === b.end) {
			endSide = maxSide(this.endSide, b.endSide);
		} else {
			endSide = this.end === newEnd ? this.endSide : b.endSide;
		}

		return new SequenceInterval(
			this.client,
			newStart,
			newEnd,
			this.intervalType,
			undefined,
			startSide,
			endSide,
		);
	}

	/**
	 * {@inheritDoc ISerializableInterval.addProperties}
	 */
	public addProperties(
		newProps: PropertySet,
		collab: boolean = false,
		seq?: number,
	): PropertySet | undefined {
		return this.propertyManager.addProperties(this.properties, newProps, seq, collab);
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
	 */
	public modify(
		label: string,
		start: SequencePlace | undefined,
		end: SequencePlace | undefined,
		op?: ISequencedDocumentMessage,
		localSeq?: number,
		useNewSlidingBehavior: boolean = false,
	) {
		const { startSide, endSide, startPos, endPos } = endpointPosAndSide(start, end);
		const stickiness = computeStickinessFromSide(
			startPos ?? this.start.getSegment()?.endpointType,
			startSide ?? this.startSide,
			endPos ?? this.end.getSegment()?.endpointType,
			endSide ?? this.endSide,
		);
		const getRefType = (baseType: ReferenceType): ReferenceType => {
			let refType = baseType;
			if (op === undefined) {
				refType &= ~ReferenceType.SlideOnRemove;
				refType |= ReferenceType.StayOnRemove;
			}
			return refType;
		};

		let startRef = this.start;
		if (startPos !== undefined) {
			startRef = createPositionReference(
				this.client,
				startPos,
				getRefType(this.start.refType),
				op,
				undefined,
				localSeq,
				startReferenceSlidingPreference(stickiness),
				startReferenceSlidingPreference(stickiness) === SlidingPreference.BACKWARD,
				useNewSlidingBehavior,
			);
			if (this.start.properties) {
				startRef.addProperties(this.start.properties);
			}
		}

		let endRef = this.end;
		if (endPos !== undefined) {
			endRef = createPositionReference(
				this.client,
				endPos,
				getRefType(this.end.refType),
				op,
				undefined,
				localSeq,
				endReferenceSlidingPreference(stickiness),
				endReferenceSlidingPreference(stickiness) === SlidingPreference.FORWARD,
				useNewSlidingBehavior,
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
			startSide ?? this.startSide,
			endSide ?? this.endSide,
		);
		if (this.properties) {
			this.propertyManager.copyTo(
				this.properties,
				newInterval.properties,
				newInterval.propertyManager,
			);
		}
		return newInterval;
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
	useNewSlidingBehavior: boolean = false,
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
			segoff = getSlideToSegoff(segoff, undefined, useNewSlidingBehavior);
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
	start: SequencePlace | undefined,
	end: SequencePlace | undefined,
	client: Client,
	intervalType: IntervalType,
	op?: ISequencedDocumentMessage,
	fromSnapshot?: boolean,
	useNewSlidingBehavior: boolean = false,
): SequenceInterval {
	const { startPos, startSide, endPos, endSide } = endpointPosAndSide(
		start ?? "start",
		end ?? "end",
	);
	assert(
		startPos !== undefined &&
			endPos !== undefined &&
			startSide !== undefined &&
			endSide !== undefined,
		0x794 /* start and end cannot be undefined because they were not passed in as undefined */,
	);
	const stickiness = computeStickinessFromSide(startPos, startSide, endPos, endSide);
	let beginRefType = ReferenceType.RangeBegin;
	let endRefType = ReferenceType.RangeEnd;
	if (intervalType === IntervalType.Transient) {
		beginRefType = ReferenceType.Transient;
		endRefType = ReferenceType.Transient;
	} else {
		// All non-transient interval references must eventually be SlideOnRemove
		// To ensure eventual consistency, they must start as StayOnRemove when
		// pending (created locally and creation op is not acked)
		if (op ?? fromSnapshot) {
			beginRefType |= ReferenceType.SlideOnRemove;
			endRefType |= ReferenceType.SlideOnRemove;
		} else {
			beginRefType |= ReferenceType.StayOnRemove;
			endRefType |= ReferenceType.StayOnRemove;
		}
	}

	const startLref = createPositionReference(
		client,
		startPos,
		beginRefType,
		op,
		fromSnapshot,
		undefined,
		startReferenceSlidingPreference(stickiness),
		startReferenceSlidingPreference(stickiness) === SlidingPreference.BACKWARD,
		useNewSlidingBehavior,
	);

	const endLref = createPositionReference(
		client,
		endPos,
		endRefType,
		op,
		fromSnapshot,
		undefined,
		endReferenceSlidingPreference(stickiness),
		endReferenceSlidingPreference(stickiness) === SlidingPreference.FORWARD,
		useNewSlidingBehavior,
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
		startSide,
		endSide,
	);
	return ival;
}

/**
 * @deprecated The methods within have substitutions
 * @internal
 */
export const sequenceIntervalHelpers: IIntervalHelpers<SequenceInterval> = {
	create: createSequenceInterval,
};
