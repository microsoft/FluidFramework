/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { fail, getOrAddEmptyToMap } from "../../util";
import { RevisionMetadataSource, RevisionTag } from "../../core";
import {
	isDetach,
	areInputCellsEmpty,
	markEmptiesCells,
	markFillsCells,
	areOutputCellsEmpty,
	isAttachAndDetachEffect,
	getOutputCellId,
	isAttach,
	isImpactfulCellRename,
} from "./utils";
import { Mark, IdRange } from "./types";

/**
 * For each revision, stores a list of IDs of detaches encountered in the base changeset which are adjacent to the
 * current position.
 * The lists are progressively extended as the tracker ingests marks that contribute to the gap and trimmed back when
 * the tracker ingests a mark that marks the end of the current gap.
 */
export class OutputGapTracker {
	/**
	 * For each revision, stores a list of IDs of detaches encountered in the base changeset which are adjacent to the current position.
	 */
	private readonly _detachBlocks = new Map<RevisionTag, IdRange[]>();

	public get detachBlocks(): ReadonlyMap<RevisionTag, readonly IdRange[]> {
		return this._detachBlocks;
	}

	public constructor(
		private readonly metadata: RevisionMetadataSource,
		private readonly onEndOfGap: (
			revision: RevisionTag | undefined,
			adjacentCells: undefined | IdRange[],
		) => void,
	) {
		this.metadata = metadata;
	}

	public ingest(mark: Mark<unknown>, markRevision: RevisionTag | undefined): void {
		if (markEmptiesCells(mark) || isImpactfulCellRename(mark, markRevision, this.metadata)) {
			// Note that we want the revision in the detach ID to be the actual revision, not the intention.
			// We don't pass a `RevisionMetadataSource` to `getOutputCellId` so that we get the true revision.
			const detachId = getOutputCellId(mark, markRevision, undefined);
			assert(detachId !== undefined, "Mark which empties cells should have a detach ID");
			assert(detachId.revision !== undefined, "Detach ID should have a revision");
			const detachBlock = getOrAddEmptyToMap(this._detachBlocks, detachId.revision);
			addIdRange(detachBlock, {
				id: detachId.localId,
				count: mark.count,
			});
		}
		const attachRevisionIndex = getAttachRevisionIndex(this.metadata, mark, markRevision);
		const detachRevisionIndex = getDetachRevisionIndex(this.metadata, mark, markRevision);
		for (const blockRevision of this._detachBlocks.keys()) {
			const revisionIndex = getRevisionIndex(this.metadata, blockRevision);
			// revisionIndex can be -Infinity if it is from a redetachId
			if (
				revisionIndex > -Infinity &&
				attachRevisionIndex <= revisionIndex &&
				revisionIndex < detachRevisionIndex
			) {
				this.onEndOfGap(blockRevision, this._detachBlocks.get(blockRevision));
				this._detachBlocks.delete(blockRevision);
			}
		}
	}

	public finalizeAllGaps(): void {
		for (const blockRevision of this._detachBlocks.keys()) {
			this.onEndOfGap(blockRevision, this._detachBlocks.get(blockRevision));
		}
		this._detachBlocks.clear();
	}
}

function getRevisionIndex(metadata: RevisionMetadataSource, revision: RevisionTag): number {
	const index = metadata.getIndex(revision);
	if (index !== undefined) {
		return index;
	}

	// This revision is not in the changesets being handled and must be older than them.
	return -Infinity;
}

function getAttachRevisionIndex(
	metadata: RevisionMetadataSource,
	mark: Mark<unknown>,
	revision: RevisionTag | undefined,
): number {
	if (!areInputCellsEmpty(mark)) {
		return -Infinity;
	}

	if (markFillsCells(mark)) {
		assert(isAttach(mark), "Only attach marks can fill cells");
		return getRevisionIndex(
			metadata,
			mark.revision ?? revision ?? fail("Mark must have revision"),
		);
	}

	if (isAttachAndDetachEffect(mark)) {
		return getRevisionIndex(
			metadata,
			mark.attach.revision ?? revision ?? fail("Mark must have revision"),
		);
	}

	return Infinity;
}

function getDetachRevisionIndex(
	metadata: RevisionMetadataSource,
	mark: Mark<unknown>,
	revision: RevisionTag | undefined,
): number {
	if (!areOutputCellsEmpty(mark)) {
		return Infinity;
	}

	if (markEmptiesCells(mark)) {
		assert(isDetach(mark), "Only detach marks can empty cells");
		return getRevisionIndex(
			metadata,
			mark.revision ?? revision ?? fail("Mark must have revision"),
		);
	}

	if (isAttachAndDetachEffect(mark)) {
		return getRevisionIndex(
			metadata,
			mark.detach.revision ?? revision ?? fail("Mark must have revision"),
		);
	}

	return -Infinity;
}

function addIdRange(detachBlock: IdRange[], range: IdRange): void {
	if (detachBlock.length > 0) {
		const lastEntry = detachBlock[detachBlock.length - 1];
		if ((lastEntry.id as number) + lastEntry.count === range.id) {
			lastEntry.count += range.count;
			return;
		}
	}

	detachBlock.push(range);
}
