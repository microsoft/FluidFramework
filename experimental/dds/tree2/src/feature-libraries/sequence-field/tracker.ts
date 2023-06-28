/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { RevisionTag } from "../../core";
import { RevisionIndexer } from "../modular-schema";
import { Mark } from "./format";
import {
	getInputLength,
	getOutputLength,
	isAttach,
	isDetachMark,
	isModify,
	isNoopMark,
	markHasCellEffect,
} from "./utils";

export class IndexTracker {
	private inputIndex: number = 0;
	private readonly contributions: { rev: RevisionTag; netLength: number }[] = [];

	public constructor(private readonly revisionIndexer: RevisionIndexer) {}

	public advance(mark: Mark<unknown>): void {
		const inLength = getInputLength(mark);
		const outLength = getOutputLength(mark);
		this.inputIndex += inLength;
		if (!markHasCellEffect(mark)) {
			return;
		}

		assert(!isNoopMark(mark) && !isModify(mark), 0x6a4 /* These marks have no cell effects */);

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
		let index = -1;
		if (this.contributions.length > 0) {
			const revisionIndex = this.revisionIndexer(revision);
			index = this.contributions.findIndex(
				({ rev }) => this.revisionIndexer(rev) >= revisionIndex,
			);
		}
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
		const revisionIndex = this.revisionIndexer(revision);
		let total = this.inputIndex;
		for (const { rev, netLength: count } of this.contributions) {
			if (this.revisionIndexer(rev) >= revisionIndex) {
				break;
			}
			total += count;
		}
		return total;
	}
}

export class GapTracker {
	private readonly map: Map<RevisionTag, number> = new Map();

	public constructor(private readonly revisionIndexer: RevisionIndexer) {}

	public advance(mark: Mark<unknown>): void {
		if (!markHasCellEffect(mark)) {
			this.map.clear();
		} else {
			assert(
				!isNoopMark(mark) && !isModify(mark) && mark.type !== "Placeholder",
				0x6a5 /* These marks have no cell effects */,
			);
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
				if (this.map.size > 0) {
					const revisionIndex = this.revisionIndexer(revision);
					for (const rev of this.map.keys()) {
						if (this.revisionIndexer(rev) > revisionIndex) {
							this.map.delete(rev);
						}
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
