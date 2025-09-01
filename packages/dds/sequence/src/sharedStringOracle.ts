/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MergeTreeDeltaType } from "@fluidframework/merge-tree/internal";

import type { SequenceDeltaEvent } from "./sequenceDeltaEvent.js";
import type { SharedString } from "./sequenceFactory.js";

/**
 * Oracle that mirrors a single SharedString instance by listening to events
 * and keeping a local array of characters.
 * @internal
 */
export class SharedStringOracle {
	private model: string[] = [];

	constructor(private readonly shared: SharedString) {
		this.model = shared.getText().split("");

		shared.on("sequenceDelta", (event: SequenceDeltaEvent) => this.applyDelta(event));
	}

	private applyDelta(e: SequenceDeltaEvent) {
		for (const range of e.ranges) {
			const pos = range.position;
			const len = range.segment.cachedLength;

			switch (range.operation) {
				case MergeTreeDeltaType.INSERT: {
					const insertedText = this.shared.getText(pos, pos + len);
					this.model.splice(pos, 0, ...insertedText.split(""));
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
					this.model = [];
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
		const actual = this.shared.getText();
		const mirror = this.model.join("");
		if (actual !== mirror) {
			throw new Error(`SharedStringOracle mismatch: expected="${mirror}", actual="${actual}"`);
		}
	}
}
