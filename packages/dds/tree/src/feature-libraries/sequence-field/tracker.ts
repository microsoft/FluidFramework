/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { RevisionTag } from "../../core";
import { Mark } from "./format";
import {
	getInputLength,
	getOutputLength,
	isAttach,
	isDetachMark,
	isNetZeroNodeCountChange,
} from "./utils";

export class IndexTracker {
	private inputIndex: number = 0;
	private readonly contributions: { rev: RevisionTag; netLength: number }[] = [];

	public advance(mark: Mark<unknown>): void {
		const inLength = getInputLength(mark);
		const outLength = getOutputLength(mark);
		this.inputIndex += inLength;
		if (isNetZeroNodeCountChange(mark)) {
			return;
		}
		const netLength = outLength - inLength;
		// If you hit this assert, then you probably need to add a check for it in `isNetZeroNodeCountChange`.
		assert(netLength !== 0, 0x501 /* Unknown mark type with net-zero node count change */);
		const revision = mark.revision;
		// TODO: Remove this early return. It is only needed because some tests use anonymous changes.
		// These tests will fail (i.e., produce the wrong result) if they rely the index tracking performed here.
		if (revision === undefined) {
			return;
		}
		assert(revision !== undefined, 0x502 /* Compose base mark should carry revision info */);
		const index = this.contributions.findIndex(({ rev }) => rev >= revision);
		if (index === -1) {
			this.contributions.push({ rev: revision, netLength });
		} else {
			if (this.contributions[index].rev !== revision) {
				this.contributions.splice(index, 0, { rev: revision, netLength });
			} else {
				this.contributions[index].netLength += netLength;
			}
		}
	}

	/**
	 * @param revision - The revision of interest.
	 * @returns The index of the next base mark in the input context of `revision`.
	 */
	public getIndex(revision: RevisionTag): number {
		let total = this.inputIndex;
		for (const { rev, netLength: count } of this.contributions) {
			if (rev >= revision) {
				break;
			}
			total += count;
		}
		return total;
	}
}

export class GapTracker {
	private readonly map: Map<RevisionTag, number> = new Map();

	public advance(mark: Mark<unknown>): void {
		if (isNetZeroNodeCountChange(mark)) {
			this.map.clear();
		} else {
			const revision = mark.revision;
			// TODO: Remove this early return. It is only needed because some tests use anonymous changes.
			// These tests will fail (i.e., produce the wrong result) if they rely the index tracking performed here.
			if (revision === undefined) {
				return;
			}
			assert(
				revision !== undefined,
				0x503 /* Compose base mark should carry revision info */,
			);
			if (isAttach(mark)) {
				// Reset the offset for the revisions chronologically after the attach to zero.
				// This is because for those revisions, the nodes were present in the input context.
				// In other words, one revision's attach is later revisions' skip.
				for (const rev of this.map.keys()) {
					if (rev > revision) {
						this.map.delete(rev);
					}
				}
			} else if (isDetachMark(mark)) {
				this.map.set(revision, this.getOffset(revision) + getInputLength(mark));
			} else {
				unreachableCase(mark);
			}
		}
	}

	/**
	 * @param revision - The revision of interest.
	 * @returns The offset of the next base mark in the gap left by `revision`.
	 * Zero if `revision` did not detach nodes at this location.
	 */
	public getOffset(revision: RevisionTag): number {
		return this.map.get(revision) ?? 0;
	}
}
