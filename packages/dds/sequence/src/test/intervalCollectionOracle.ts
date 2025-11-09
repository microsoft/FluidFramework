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
			this.addInterval(interval);
		}
	}

	private readonly addInterval = (interval: SequenceInterval) => {
		this.intervals.set(interval.getIntervalId(), {
			id: interval.getIntervalId(),
			start: interval.start,
			end: interval.end,
			properties: { ...interval.properties },
		});
	};

	private readonly deleteInterval = (interval: SequenceInterval) => {
		this.intervals.delete(interval.getIntervalId());
	};

	private readonly changeInterval = (interval: SequenceInterval) => {
		const existing = this.intervals.get(interval.getIntervalId());
		if (existing) {
			existing.start = interval.start;
			existing.end = interval.end;
			existing.properties = interval.properties;
		}
	};

	private readonly propertyChanged = (interval: SequenceInterval, propertyDeltas: any) => {
		if (!interval) return;
		const existing = this.intervals.get(interval.getIntervalId());
		if (existing && propertyDeltas) {
			for (const key of Object.keys(propertyDeltas)) {
				existing.properties[key] = interval.properties[key];
			}
		}
	};

	private readonly changed = (
		interval: SequenceInterval,
		propertyDeltas: any,
		previousInterval: any,
	) => {
		if (!interval) return;
		const existing = this.intervals.get(interval.getIntervalId());
		if (existing) {
			if (previousInterval) {
				existing.start = interval.start;
				existing.end = interval.end;
			}
			if (propertyDeltas) {
				for (const key of Object.keys(propertyDeltas)) {
					existing.properties[key] = interval.properties[key];
				}
			}
		}
	};

	validate(sharedString: SharedString) {
		for (const [id, snapshot] of this.intervals) {
			const actual = this.collection.getIntervalById(id);
			if (!actual) continue;

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
