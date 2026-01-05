/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { PropertySet, ReferencePosition } from "@fluidframework/merge-tree/internal";

import type { ISequenceIntervalCollection } from "../intervalCollection.js";
import type { SequenceInterval } from "../intervals/index.js";
import type { SharedString } from "../sequenceFactory.js";

// import { assertSequenceIntervals } from "./intervalTestUtils.js";

/**
 * Lightweight snapshot to store mutable interval info
 * @internal
 */
interface IntervalSnapshot {
	id: string;
	start: ReferencePosition;
	end: ReferencePosition;
	properties: PropertySet;
}

/**
 * @internal
 */
export class IntervalCollectionOracle {
	private readonly intervals: Map<string, IntervalSnapshot> = new Map();

	constructor(private readonly collection: ISequenceIntervalCollection) {
		this.collection.on("addInterval", this.addInterval);
		this.collection.on("deleteInterval", this.deleteInterval);
		this.collection.on("changed", this.changed);
		this.collection.on("changeInterval", this.changeInterval);
		this.collection.on("propertyChanged", this.propertyChanged);

		// initial snapshot
		for (const interval of this.collection) {
			// Initialize with dummy values for local and op since we're just snapshotting existing intervals
			this.intervals.set(interval.getIntervalId(), {
				id: interval.getIntervalId(),
				start: interval.start,
				end: interval.end,
				properties: { ...interval.properties },
			});
		}
	}

	private readonly addInterval = (interval: SequenceInterval, local: boolean, op: any) => {
		assert(
			interval,
			"BUG: addInterval event received with undefined interval - violates API contract",
		);
		this.intervals.set(interval.getIntervalId(), {
			id: interval.getIntervalId(),
			start: interval.start,
			end: interval.end,
			properties: { ...interval.properties },
		});
	};

	private readonly deleteInterval = (interval: SequenceInterval, local: boolean, op: any) => {
		assert(
			interval,
			"BUG: deleteInterval event received with undefined interval - violates API contract",
		);
		this.intervals.delete(interval.getIntervalId());
	};

	private readonly changeInterval = (
		interval: SequenceInterval,
		previousInterval: SequenceInterval,
		local: boolean,
		op: any,
		slide: boolean,
	) => {
		// API contract: both intervals must never be undefined
		assert(
			interval,
			"BUG: changeInterval event received with undefined interval - violates API contract",
		);
		assert(
			previousInterval,
			"BUG: changeInterval event received with undefined previousInterval - violates API contract",
		);
		const existing = this.intervals.get(interval.getIntervalId());
		assert(
			existing,
			`BUG: changeInterval event for interval ${interval.getIntervalId()} that doesn't exist in oracle - missed addInterval event or events out of order`,
		);
		existing.start = interval.start;
		existing.end = interval.end;
		existing.properties = interval.properties;
	};

	private readonly propertyChanged = (
		interval: SequenceInterval,
		propertyDeltas: any,
		local: boolean,
		op: any,
	) => {
		// API contract: interval must never be undefined
		assert(
			interval,
			"BUG: propertyChanged event received with undefined interval - violates API contract",
		);
		assert(
			propertyDeltas && typeof propertyDeltas === "object",
			"BUG: propertyChanged 'propertyDeltas' must be a non-null object - violates API contract",
		);
		const existing = this.intervals.get(interval.getIntervalId());
		assert(
			existing,
			`BUG: propertyChanged event for interval ${interval.getIntervalId()} that doesn't exist in oracle - missed addInterval event or events out of order`,
		);
		for (const key of Object.keys(propertyDeltas)) {
			existing.properties[key] = interval.properties[key];
		}
	};
	private readonly changed = (
		interval: SequenceInterval,
		propertyDeltas: PropertySet,
		previousInterval: any,
		local: boolean,
		slide: boolean,
	) => {
		assert(
			interval,
			"BUG: changed event received with undefined interval - violates API contract",
		);
		assert(
			propertyDeltas !== undefined &&
				propertyDeltas !== null &&
				typeof propertyDeltas === "object",
			"BUG: changed 'propertyDeltas' must be a non-null object (can be empty) - violates API contract",
		);
		const existing = this.intervals.get(interval.getIntervalId());
		assert(
			existing,
			`BUG: changed event for interval ${interval.getIntervalId()} that doesn't exist in oracle - missed addInterval event or events out of order`,
		);
		if (previousInterval !== undefined) {
			existing.start = interval.start;
			existing.end = interval.end;
		}
		for (const key of Object.keys(propertyDeltas)) {
			existing.properties[key] = interval.properties[key];
		}
	};
	validate(sharedString: SharedString) {
		// First check: all intervals in oracle should exist in collection
		for (const [id, snapshot] of this.intervals) {
			const actual = this.collection.getIntervalById(id);
			assert(
				actual,
				`Interval ${id} exists in oracle but not in collection - interval was unexpectedly removed or collection is out of sync`,
			);

			const expectedStart = sharedString.localReferencePositionToPosition(snapshot.start);
			const expectedEnd = sharedString.localReferencePositionToPosition(snapshot.end);

			const actualStart = sharedString.localReferencePositionToPosition(actual.start);
			const actualEnd = sharedString.localReferencePositionToPosition(actual.end);

			assert.strictEqual(expectedStart, actualStart, `Interval ${id} start mismatch`);
			assert.strictEqual(expectedEnd, actualEnd, `Interval ${id} end mismatch`);

			// compare properties
			assert.deepStrictEqual(
				this.normalizeProps(snapshot.properties),
				this.normalizeProps(actual.properties),
				`Interval ${id} properties mismatch\n  oracle=${JSON.stringify(
					snapshot.properties,
				)}\n  actual=${JSON.stringify(actual.properties)}`,
			);
		}

		// Second check: all intervals in collection should exist in oracle
		for (const interval of this.collection) {
			const id = interval.getIntervalId();
			assert(
				this.intervals.has(id),
				`Interval ${id} exists in collection but not in oracle - oracle missed an addInterval event or is out of sync`,
			);
		}
	}

	normalizeProps(props: Record<string, any> | undefined) {
		if (!props) return {};
		const clean: Record<string, any> = {};
		for (const [k, v] of Object.entries(props)) {
			if (v !== undefined) {
				clean[k] = v;
			}
		}
		return clean;
	}

	dispose() {
		this.collection.off("addInterval", this.addInterval);
		this.collection.off("deleteInterval", this.deleteInterval);
		this.collection.off("changed", this.changed);
		this.collection.off("changeInterval", this.changeInterval);
		this.collection.off("propertyChanged", this.propertyChanged);
	}
}
