/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { MergeTreeDeltaType, TextSegment } from "@fluidframework/merge-tree/internal";

import type { SequenceDeltaEvent } from "../../sequenceDeltaEvent.js";
import type { SharedString } from "../../sequenceFactory.js";
import { IntervalCollectionOracle } from "../intervalCollectionOracle.js";

/**
 * Oracle that mirrors a single SharedString instance by listening to events
 * and keeping a local array of characters.
 * @internal
 */
export class SharedStringOracle {
	private readonly model: string[] = [];
	private readonly intervalOracle: Map<string, IntervalCollectionOracle> = new Map();
	private readonly onDelta = (event: SequenceDeltaEvent) => this.applyDelta(event);

	constructor(private readonly sharedString: SharedString) {
		this.model = sharedString.getText().split("");

		// create interval oracles for each label
		for (const label of this.sharedString.getIntervalCollectionLabels()) {
			const collection = this.sharedString.getIntervalCollection(label);
			const oracle = new IntervalCollectionOracle(collection);
			this.intervalOracle.set(label, oracle);
		}

		this.sharedString.on("sequenceDelta", this.onDelta);
	}

	private applyDelta(e: SequenceDeltaEvent) {
		for (const range of e.ranges) {
			const pos = range.position;
			const len = range.segment.cachedLength;

			switch (range.operation) {
				case MergeTreeDeltaType.INSERT: {
					if (TextSegment.is(range.segment)) {
						this.model.splice(pos, 0, ...range.segment.text.split(""));
					}
					break;
				}
				case MergeTreeDeltaType.REMOVE: {
					this.model.splice(pos, len);
					break;
				}
				case MergeTreeDeltaType.ANNOTATE: {
					// Optional: track annotations if needed
					break;
				}
				case MergeTreeDeltaType.OBLITERATE: {
					this.model.splice(pos, len);
					break;
				}
				default: {
					throw new Error(`Unhandled delta operation: ${range.operation}`);
				}
			}
		}
	}

	/**
	 * Validate that the oracle’s model matches the actual SharedString.
	 * Throws an error if there’s a mismatch.
	 */
	validate() {
		const actual = this.sharedString.getText();
		const mirror = this.model.join("");
		assert.deepStrictEqual(
			actual,
			mirror,
			`SharedStringOracle mismatch: expected="${mirror}", actual="${actual}"`,
		);

		// validate intervals
		for (const [, oracle] of this.intervalOracle) {
			oracle.validate(this.sharedString);
		}
	}

	dispose() {
		this.sharedString.off("sequenceDelta", this.onDelta);
		for (const oracle of this.intervalOracle.values()) {
			oracle.dispose();
		}
	}
}
