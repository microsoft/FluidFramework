/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { IRandom } from "@fluid-private/stochastic-test-utils";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	addProperties,
	copyPropertiesAndManager,
	createMap,
	type PropertiesManager,
	PropertySet,
	type SequencePlace,
	Side,
} from "@fluidframework/merge-tree/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import {
	IntervalStickiness,
	type ISerializableInterval,
	type ISerializedInterval,
	type SequenceInterval,
} from "../intervals/index.js";
import type { ISharedString } from "../sharedString.js";

/**
 * Serializable interval whose endpoints are plain-old numbers.
 * @internal
 */
export class Interval implements ISerializableInterval {
	/**
	 * {@inheritDoc ISerializableInterval.properties}
	 */
	public properties: PropertySet = createMap<any>();

	/***/
	public auxProps: PropertySet[] | undefined;

	public propertyManager?: PropertiesManager;

	constructor(
		public start: number,
		public end: number,
		props?: PropertySet,
	) {
		if (props) {
			this.properties = addProperties(this.properties, props);
		}
	}

	/**
	 * {@inheritDoc ISerializableInterval.getIntervalId}
	 */
	public getIntervalId(): string {
		const id = this.properties?.[reservedIntervalIdKey];
		assert(id !== undefined, "interval ID should not be undefined");
		return `${id}`;
	}

	/**
	 * @returns an array containing any auxiliary property sets added with `addPropertySet`.
	 */
	public getAdditionalPropertySets(): PropertySet[] {
		return this.auxProps ?? [];
	}

	/**
	 * Adds an auxiliary set of properties to this interval.
	 * These properties can be recovered using `getAdditionalPropertySets`
	 * @param props - set of properties to add
	 * @remarks This gets called as part of the default conflict resolver for `IIntervalCollection<Interval>`
	 * (i.e. non-sequence-based interval collections). However, the additional properties don't get serialized.
	 * This functionality seems half-baked.
	 */
	public addPropertySet(props: PropertySet) {
		if (this.auxProps === undefined) {
			this.auxProps = [];
		}
		this.auxProps.push(props);
	}

	/**
	 * {@inheritDoc ISerializableInterval.serialize}
	 */
	public serialize(): ISerializedInterval {
		const serializedInterval: ISerializedInterval = {
			end: this.end,
			intervalType: 0,
			sequenceNumber: 0,
			start: this.start,
		};
		if (this.properties) {
			serializedInterval.properties = addProperties(
				serializedInterval.properties,
				this.properties,
			);
		}
		return serializedInterval;
	}

	/**
	 * {@inheritDoc IInterval.clone}
	 */
	public clone() {
		return new Interval(this.start, this.end, this.properties);
	}

	/**
	 * {@inheritDoc IInterval.compare}
	 */
	public compare(b: Interval) {
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
	public compareStart(b: Interval) {
		return this.start - b.start;
	}

	/**
	 * {@inheritDoc IInterval.compareEnd}
	 */
	public compareEnd(b: Interval) {
		return this.end - b.end;
	}

	/**
	 * {@inheritDoc IInterval.overlaps}
	 */
	public overlaps(b: Interval) {
		const result = this.start <= b.end && this.end >= b.start;
		return result;
	}

	/**
	 * {@inheritDoc IInterval.union}
	 */
	public union(b: Interval) {
		return new Interval(
			Math.min(this.start, b.start),
			Math.max(this.end, b.end),
			this.properties,
		);
	}

	public getProperties() {
		return this.properties;
	}

	/**
	 * {@inheritDoc IInterval.modify}
	 */
	public modify(
		label: string,
		start?: SequencePlace,
		end?: SequencePlace,
		op?: ISequencedDocumentMessage,
	) {
		if (typeof start === "string" || typeof end === "string") {
			throw new UsageError(
				"The start and end positions of a plain interval may not be on the special endpoint segments.",
			);
		}

		const startPos = typeof start === "number" ? start : (start?.pos ?? this.start);
		const endPos = typeof end === "number" ? end : (end?.pos ?? this.end);

		if (this.start === startPos && this.end === endPos) {
			// Return undefined to indicate that no change is necessary.
			return;
		}
		const newInterval = new Interval(startPos, endPos);
		copyPropertiesAndManager(this, newInterval);
		return newInterval;
	}
}

const reservedIntervalIdKey = "intervalId";

export interface RandomIntervalOptions {
	random: IRandom;
	count: number;
	min: number;
	max: number;
}

/**
 * Asserts that the results match the expected endpoints or intervals.
 * @param results - The generated intervals to compare.
 * @param expectedEndpoints - The expected start and end points or intervals.
 */
export function assertPlainNumberIntervals(
	results: Interval[],
	expectedEndpoints: { start: number; end: number }[] | Interval[],
): void {
	assert.equal(results.length, expectedEndpoints.length, "Mismatched result count");
	for (let i = 0; i < results.length; ++i) {
		assert(results[i]);
		assert.equal(results[i].start, expectedEndpoints[i].start, "mismatched start");
		assert.equal(results[i].end, expectedEndpoints[i].end, "mismatched end");
	}
}

/**
 * Creates a new (regular) Interval object with the specified start and end values.
 * @param start - The start value of the interval.
 * @param end - The end value of the interval.
 * @returns The created Interval object.
 */
export function createTestInterval(start: number, end: number): Interval {
	const props: PropertySet = {};
	props[reservedIntervalIdKey] = [uuid()];

	return new Interval(start, end, props);
}

/**
 * Generates random intervals based on the randomness-related options.
 * @param options - The options for generating random intervals.
 * @returns An array of generated Interval objects.
 */
export function generateRandomIntervals(options: RandomIntervalOptions) {
	const intervals: Interval[] = [];
	const { random, count, min, max } = options;

	for (let i = 0; i < count; ++i) {
		const start = random.integer(min, max);
		const end = random.integer(start, max);
		const interval = createTestInterval(start, end);
		intervals.push(interval);
	}

	return intervals;
}

/**
 * Infer the side of a SequencePlace.
 */
export function sideFromSequencePlace(place: SequencePlace): Side {
	if (typeof place === "object") {
		return place.side;
	} else if (place === "start") {
		return Side.After;
	} else {
		return Side.Before;
	}
}
/**
 * position identifies a character, and does not take into account which side of the character.
 *
 * @param place - The SequencePlace used as an expected position of a sequence endpoint.
 *
 * @param posIfEnd - The position to expect if `place` is "end". This is not currently consistent.
 * Sometimes it is string.length, sometimes it is -1.
 */
export function expectedPositionFromSequencePlace(
	place: SequencePlace,
	posIfEnd: number = -1,
): number {
	if (place === "start") {
		return 0;
	} else if (place === "end") {
		return posIfEnd;
	} else if (typeof place === "object") {
		return place.pos;
	} else {
		return place;
	}
}

/**
 * @returns the index to be used with methods such as substring, taking side into account.
 */
export function expectedIndexFromSequencePlace(
	place: SequencePlace,
	ifEnd: number = -1,
): number {
	if (place === "start") {
		return 0;
	} else if (place === "end") {
		return ifEnd;
	} else if (typeof place === "object") {
		return place.side === Side.Before ? place.pos : place.pos + 1;
	} else {
		return place;
	}
}

/**
 * Resolves an interval in a given shared string to indices which may be passed to methods such as substring.
 * In other words, it re-anchors the endpoints to both use Side.before.
 *
 * @param sharedString - The shared string to resolve `interval` in.
 * This must be the shared string which created the interval.
 *
 * @param interval - The interval to resolve.
 *
 * @returns the indices to be used with methods such as substring for a given SequenceInterval.
 */
export function indicesFromSequenceInterval(
	sharedString: ISharedString,
	interval: SequenceInterval,
): [number, number] {
	let start = sharedString.localReferencePositionToPosition(interval.start);
	if (start === -1) {
		start = sharedString.getLength();
	}
	const end = sharedString.localReferencePositionToPosition(interval.end);
	return [
		interval.startSide === Side.Before ? start : start + 1,
		interval.endSide === Side.Before ? end : end + 1,
	];
}

/**
 * Assert that the interval with the given id in the given shared string matches the expected interval.
 * @param sharedString - The shared string to check the interval in.
 * @param intervalId - The id of the interval to check.
 * @param expected - The expected interval.
 */
export function assertInterval(
	sharedString: ISharedString,
	intervalId: string,
	expected: [SequencePlace, SequencePlace],
): void {
	const actual = sharedString.getIntervalCollection("test").getIntervalById(intervalId);
	assert(actual);
	let expectedStickiness: IntervalStickiness;
	if (
		sideFromSequencePlace(expected[0]) === Side.After &&
		sideFromSequencePlace(expected[1]) === Side.After
	) {
		expectedStickiness = IntervalStickiness.START;
	} else if (sideFromSequencePlace(expected[0]) === Side.After) {
		expectedStickiness = IntervalStickiness.FULL;
	} else if (sideFromSequencePlace(expected[1]) === Side.After) {
		expectedStickiness = IntervalStickiness.NONE;
	} else {
		expectedStickiness = IntervalStickiness.END;
	}
	assert.equal(actual.stickiness, expectedStickiness, "unexpected stickiness");
	const [expectedStart, expectedEnd] = expected;
	assert.equal(
		actual.startSide,
		typeof expectedStart === "object" ? expectedStart.side : Side.Before,
		"unexpected start side",
	);
	const actualStart = sharedString.localReferencePositionToPosition(actual.start);
	assert.equal(actualStart, expectedPositionFromSequencePlace(expectedStart, -1));
	assert.equal(
		actual.endSide,
		typeof expectedEnd === "object" ? expectedEnd.side : Side.Before,
		"unexpected end side",
	);
	const actualEnd = sharedString.localReferencePositionToPosition(actual.end);
	assert.equal(
		actualEnd,
		expectedPositionFromSequencePlace(expectedEnd, sharedString.getLength()),
		"unexpected end position",
	);
	assert(actualStart <= actualEnd, "start position should be before end");
	const expectedIntervalText = sharedString
		.getText()
		.substring(
			expectedIndexFromSequencePlace(expectedStart, sharedString.getLength()),
			expectedIndexFromSequencePlace(expectedEnd, sharedString.getLength()),
		);
	const actualIndices = indicesFromSequenceInterval(sharedString, actual);
	assert(actualStart <= actualEnd, "start index should be before end");
	assert.equal(
		sharedString.getText().substring(...actualIndices),
		expectedIntervalText,
		"unexpected text",
	);
}
