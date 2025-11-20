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
		assert(interval, "addInterval event received with undefined interval");
		assert(
			typeof local === "boolean",
			`addInterval 'local' parameter must be boolean, got ${typeof local}`,
		);
		assert(
			!this.intervals.has(interval.getIntervalId()),
			`addInterval event for interval ${interval.getIntervalId()} that already exists in oracle`,
		);
		this.intervals.set(interval.getIntervalId(), {
			id: interval.getIntervalId(),
			start: interval.start,
			end: interval.end,
			properties: { ...interval.properties },
		});
	};

	private readonly deleteInterval = (interval: SequenceInterval, local: boolean, op: any) => {
		assert(interval, "deleteInterval event received with undefined interval");
		assert(
			typeof local === "boolean",
			`deleteInterval 'local' parameter must be boolean, got ${typeof local}`,
		);
		const existing = this.intervals.get(interval.getIntervalId());
		assert(
			existing,
			`deleteInterval event for interval ${interval.getIntervalId()} that doesn't exist in oracle`,
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
		assert(
			interval,
			"changeInterval event received with undefined interval - violates ISequenceIntervalCollectionEvents contract",
		);
		assert(
			previousInterval,
			"changeInterval event received with undefined previousInterval - violates ISequenceIntervalCollectionEvents contract",
		);
		assert(
			typeof local === "boolean",
			`changeInterval 'local' parameter must be boolean, got ${typeof local}`,
		);
		assert(
			typeof slide === "boolean",
			`changeInterval 'slide' parameter must be boolean, got ${typeof slide}`,
		);
		const existing = this.intervals.get(interval.getIntervalId());
		assert(
			existing,
			`changeInterval event received for interval ${interval.getIntervalId()} that doesn't exist in oracle - interval may have been deleted`,
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
		// Oracle strict validation: The 'interval' parameter should NEVER be undefined per ISequenceIntervalCollectionEvents.
		// However, there's a bug in intervalCollection.ts ackChange() where latestInterval can be undefined when:
		// 1. An interval has been deleted from the collection (latestInterval = undefined)
		// 2. But property changes are still being acknowledged from pending ops (intervalToChange exists from consensus)
		// 3. The code emits events with undefined latestInterval, violating the type contract
		// This assertion catches that bug during fuzz testing.
		assert(
			interval,
			"propertyChanged event received with undefined interval - violates ISequenceIntervalCollectionEvents contract. " +
				"See intervalCollection.ts ackChange() line 1439 where latestInterval can be undefined.",
		);
		assert(
			typeof local === "boolean",
			`propertyChanged 'local' parameter must be boolean, got ${typeof local}`,
		);
		assert(
			propertyDeltas && typeof propertyDeltas === "object",
			"propertyChanged 'propertyDeltas' must be a non-null object",
		);
		const existing = this.intervals.get(interval.getIntervalId());
		assert(
			existing,
			`propertyChanged event received for interval ${interval.getIntervalId()} that doesn't exist in oracle - interval may have been deleted`,
		);
		if (propertyDeltas) {
			for (const key of Object.keys(propertyDeltas)) {
				existing.properties[key] = interval.properties[key];
			}
		}
	};

	private readonly changed = (
		interval: SequenceInterval,
		propertyDeltas: any,
		previousInterval: any,
		local: boolean,
		slide: boolean,
	) => {
		// Oracle strict validation: The 'interval' parameter should NEVER be undefined per ISequenceIntervalCollectionEvents.
		// Note: 'previousInterval' (3rd param) CAN legitimately be undefined for property-only changes.
		// However, there's a bug in intervalCollection.ts ackChange() where latestInterval can be undefined when:
		// 1. An interval has been deleted from the collection (latestInterval = undefined)
		// 2. But property changes are still being acknowledged from pending ops (intervalToChange exists from consensus)
		// 3. The code emits events with undefined latestInterval, violating the type contract
		// This assertion catches that bug during fuzz testing.
		assert(
			interval,
			"changed event received with undefined interval - violates ISequenceIntervalCollectionEvents contract. " +
				"See intervalCollection.ts ackChange() line 1440 where latestInterval can be undefined.",
		);
		assert(
			typeof local === "boolean",
			`changed 'local' parameter must be boolean, got ${typeof local}`,
		);
		assert(
			typeof slide === "boolean",
			`changed 'slide' parameter must be boolean, got ${typeof slide}`,
		);
		// Validate previousInterval is undefined only for property-only changes
		if (previousInterval === undefined && propertyDeltas === undefined) {
			assert.fail(
				"changed event has both previousInterval and propertyDeltas undefined - at least one should be defined",
			);
		}
		const existing = this.intervals.get(interval.getIntervalId());
		assert(
			existing,
			`changed event received for interval ${interval.getIntervalId()} that doesn't exist in oracle - interval may have been deleted`,
		);
		if (previousInterval) {
			existing.start = interval.start;
			existing.end = interval.end;
		}
		if (propertyDeltas) {
			for (const key of Object.keys(propertyDeltas)) {
				existing.properties[key] = interval.properties[key];
			}
		}
	};

	validate(sharedString: SharedString) {
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

			// compare properties structurally
			assert.deepStrictEqual(
				this.normalizeProps(snapshot.properties),
				this.normalizeProps(actual.properties),
				`Interval ${id} properties mismatch\n  oracle=${JSON.stringify(
					snapshot.properties,
				)}\n  actual=${JSON.stringify(actual.properties)}`,
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
