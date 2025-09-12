/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { PropertySet, ReferencePosition } from "@fluidframework/merge-tree/internal";

import type { ISequenceIntervalCollectionEvents } from "../intervalCollection.js";
import type { SequenceInterval } from "../intervals/index.js";

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
export type IntervalCollectionWithEvents =
	TypedEventEmitter<ISequenceIntervalCollectionEvents> & {
		getIntervalById(id: string): SequenceInterval | undefined;
	};

/**
 * @internal
 */
export class IntervalCollectionOracle {
	private readonly intervals: Map<string, IntervalSnapshot> = new Map();

	constructor(private readonly collection: IntervalCollectionWithEvents) {
		this.attachListeners();
	}

	private attachListeners() {
		// Track newly added intervals in the oracle by storing a snapshot of their start, end, and properties.
		// This allows the oracle to later validate the collection’s state.
		this.collection.on("addInterval", (interval, local, op) => {
			this.intervals.set(interval.getIntervalId(), {
				id: interval.getIntervalId(),
				start: interval.start,
				end: interval.end,
				properties: { ...interval.properties },
			});
		});

		// Remove the interval snapshot from the oracle when an interval is deleted.
		// Keeps the oracle’s state in sync with the collection.
		this.collection.on("deleteInterval", (interval, local, op) => {
			this.intervals.delete(interval.getIntervalId());
		});

		// Update the stored snapshot’s start and end positions when an interval’s endpoints change.
		// This ensures the oracle reflects the latest interval positions.
		this.collection.on("changeInterval", (interval, previousInterval, local, op, slide) => {
			const existing = this.intervals.get(interval.getIntervalId());
			if (existing) {
				existing.start = interval.start;
				existing.end = interval.end;
			}
		});

		// Update the stored snapshot’s properties when an interval’s properties change.
		// This keeps the oracle in sync with property updates.
		this.collection.on("propertyChanged", (interval, propertyDeltas, local, op) => {
			// assert(interval !== undefined, "Expected interval to have id");
			if (!interval) return;
			const existing = this.intervals.get(interval.getIntervalId());
			if (existing && propertyDeltas) {
				for (const key of Object.keys(propertyDeltas)) {
					existing.properties[key] = interval.properties[key];
				}
			}
		});

		// Update the stored snapshot for any combined changes (endpoints or properties).
		// Handles cases where both endpoints and properties change simultaneously.
		this.collection.on(
			"changed",
			(interval, propertyDeltas, previousInterval, local, slide) => {
				// assert(interval !== undefined, "Expected interval to have id");
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
			},
		);
	}

	public validate() {
		for (const [id, snapshot] of this.intervals) {
			const actual = this.collection.getIntervalById(id);

			// Skip validation for intervals still in pending state
			if (!actual) {
				continue;
			}

			const startOffset = snapshot.start.getOffset();
			const endOffset = snapshot.end.getOffset();
			const actualStartOffset = actual.start.getOffset();
			const actualEndOffset = actual.end.getOffset();

			assert.deepStrictEqual(
				startOffset,
				actualStartOffset,
				`Interval ${id} start mismatch: oracle=${startOffset}, actual=${actualStartOffset}`,
			);

			assert.deepStrictEqual(
				endOffset,
				actualEndOffset,
				`Interval ${id} end mismatch: oracle=${endOffset}, actual=${actualEndOffset}`,
			);
		}
	}

	public dispose() {
		this.intervals.clear();
	}
}
