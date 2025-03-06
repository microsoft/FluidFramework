/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import fs from "node:fs";

import { NonCollabClient, UnassignedSequenceNumber } from "../constants.js";
import { LocalReferenceCollection } from "../localReference.js";
import { MergeTree } from "../mergeTree.js";
import {
	IMergeTreeDeltaOpArgs,
	type IMergeTreeDeltaCallbackArgs,
	type IMergeTreeMaintenanceCallbackArgs,
} from "../mergeTreeDeltaCallback.js";
import { walkAllChildSegments } from "../mergeTreeNodeWalk.js";
import {
	MergeBlock,
	ISegmentPrivate,
	Marker,
	type OperationTimestamp,
	timestampUtils,
} from "../mergeTreeNodes.js";
import { ReferenceType } from "../ops.js";
import {
	PartialSequenceLengths,
	verifyExpectedPartialLengths,
	verifyPartialLengths,
} from "../partialLengths.js";
import { PropertySet } from "../properties.js";
import * as info from "../segmentInfos.js";
import { TextSegment } from "../textSegment.js";

import { loadText } from "./text.js";

export function loadTextFromFile(
	filename: string,
	mergeTree: MergeTree,
	segLimit = 0,
): MergeTree {
	const content = fs.readFileSync(filename, "utf8");
	return loadText(content, mergeTree, segLimit);
}

export function loadTextFromFileWithMarkers(
	filename: string,
	mergeTree: MergeTree,
	segLimit = 0,
): MergeTree {
	const content = fs.readFileSync(filename, "utf8");
	return loadText(content, mergeTree, segLimit, true);
}

interface InsertMarkerArgs {
	mergeTree: MergeTree;
	pos: number;
	refSeq: number;
	clientId: number;
	seq: number;
	behaviors: ReferenceType;
	props: PropertySet | undefined;
	opArgs: IMergeTreeDeltaOpArgs;
}

export function insertMarker({
	mergeTree,
	pos,
	refSeq,
	clientId,
	seq,
	behaviors,
	props,
	opArgs,
}: InsertMarkerArgs): void {
	mergeTree.insertSegments(
		pos,
		[Marker.make(behaviors, props)],
		refSeq,
		clientId,
		seq,
		opArgs,
	);
}

interface InsertTextArgs {
	mergeTree: MergeTree;
	pos: number;
	refSeq: number;
	clientId: number;
	seq: number;
	text: string;
	props?: PropertySet;
	opArgs?: IMergeTreeDeltaOpArgs;
}

export function insertText({
	mergeTree,
	pos,
	refSeq,
	clientId,
	seq,
	text,
	props,
	opArgs,
}: InsertTextArgs): void {
	mergeTree.insertSegments(
		pos,
		[TextSegment.make(text, props)],
		refSeq,
		clientId,
		seq,
		opArgs,
	);
}

interface InsertSegmentsArgs {
	mergeTree: MergeTree;
	pos: number;
	segments: ISegmentPrivate[];
	refSeq: number;
	clientId: number;
	seq: number;
	opArgs: IMergeTreeDeltaOpArgs | undefined;
}

export function insertSegments({
	mergeTree,
	pos,
	segments,
	refSeq,
	clientId,
	seq,
	opArgs,
}: InsertSegmentsArgs): void {
	mergeTree.insertSegments(pos, segments, refSeq, clientId, seq, opArgs);
}

interface MarkRangeRemovedArgs {
	mergeTree: MergeTree;
	start: number;
	end: number;
	refSeq: number;
	clientId: number;
	seq: number;
	overwrite: boolean;
	opArgs: IMergeTreeDeltaOpArgs;
}

export function markRangeRemoved({
	mergeTree,
	start,
	end,
	refSeq,
	clientId,
	seq,
	opArgs,
}: MarkRangeRemovedArgs): void {
	mergeTree.markRangeRemoved(start, end, refSeq, clientId, seq, opArgs);
}

export function obliterateRange({
	mergeTree,
	start,
	end,
	refSeq,
	clientId,
	seq,
	opArgs,
}: {
	mergeTree: MergeTree;
	start: number;
	end: number;
	refSeq: number;
	clientId: number;
	seq: number;
	opArgs: IMergeTreeDeltaOpArgs;
}): void {
	mergeTree.obliterateRange(start, end, refSeq, clientId, seq, opArgs);
}

export function nodeOrdinalsHaveIntegrity(block: MergeBlock): boolean {
	const olen = block.ordinal.length;
	for (let i = 0; i < block.childCount; i++) {
		if (block.children[i].ordinal) {
			if (olen !== block.children[i].ordinal.length - 1) {
				console.log("node integrity issue");
				return false;
			}
			if (i > 0 && block.children[i].ordinal <= block.children[i - 1].ordinal) {
				console.log("node sib integrity issue");
				return false;
			}
			if (!block.children[i].isLeaf()) {
				return nodeOrdinalsHaveIntegrity(block.children[i] as MergeBlock);
			}
		} else {
			console.log(`node child ordinal not set ${i}`);
			return false;
		}
	}
	return true;
}

/**
 * Returns an object that tallies each delta and maintenance operation observed
 * for the given 'mergeTree'.
 */
export function countOperations(mergeTree: MergeTree): object {
	const counts = {};

	assert.strictEqual(mergeTree.mergeTreeDeltaCallback, undefined);
	assert.strictEqual(mergeTree.mergeTreeMaintenanceCallback, undefined);

	const fn = (
		deltaArgs: IMergeTreeDeltaCallbackArgs | IMergeTreeMaintenanceCallbackArgs,
	): void => {
		const previous = counts[deltaArgs.operation] as undefined | number;
		counts[deltaArgs.operation] = previous === undefined ? 1 : previous + 1;
	};

	mergeTree.mergeTreeDeltaCallback = (opArgs, deltaArgs): void => {
		fn(deltaArgs);
	};
	mergeTree.mergeTreeMaintenanceCallback = fn;

	return counts;
}

function getPartialLengths(
	clientId: number,
	seq: number,
	mergeTree: MergeTree,
	localSeq?: number,
	mergeBlock: MergeBlock = mergeTree.root,
): {
	partialLen: number | undefined;
	actualLen: number;
} {
	const partialLen = mergeBlock.partialLengths?.getPartialLength(seq, clientId, localSeq);

	let actualLen = 0;

	// TODO: The new and old codepath for this function never cares about the case where a client expects another client to see
	// their own prior operations. Looks like most test code that uses this indirectly via validatePartialLengths doesn't exercise
	// places where it matters, but we should probably fix this.
	const perspectiveStamp: OperationTimestamp = {
		seq,
		clientId: NonCollabClient,
		localSeq,
	};

	const isInserted = (segment: ISegmentPrivate): boolean =>
		info.isInserted(segment) && timestampUtils.lte(segment.insert, perspectiveStamp);

	const isRemoved = (segment: ISegmentPrivate): boolean =>
		info.isRemoved(segment) &&
		((localSeq !== undefined &&
			timestampUtils.isLocal(segment.removes[segment.removes.length - 1]) &&
			segment.removes[segment.removes.length - 1].localSeq! <= localSeq) ||
			timestampUtils.lte(segment.removes[0], perspectiveStamp));

	const isMoved = (segment: ISegmentPrivate): boolean =>
		info.isMoved(segment) &&
		((localSeq !== undefined &&
			segment.movedSeq === UnassignedSequenceNumber &&
			segment.localMovedSeq !== undefined &&
			segment.localMovedSeq <= localSeq) ||
			(segment.movedSeq !== UnassignedSequenceNumber && segment.movedSeq <= seq));

	walkAllChildSegments(mergeBlock, (segment) => {
		if (isInserted(segment) && !isRemoved(segment) && !isMoved(segment)) {
			actualLen += segment.cachedLength;
		}
		return true;
	});

	return {
		partialLen,
		actualLen,
	};
}

export function validatePartialLengths(
	clientId: number,
	mergeTree: MergeTree,
	expectedValues?: { seq: number; len: number; localSeq?: number }[],
	localSeq?: number,
	mergeBlock: MergeBlock = mergeTree.root,
): void {
	mergeTree.computeLocalPartials(0);
	for (
		let i = mergeTree.collabWindow.minSeq + 1;
		i <= mergeTree.collabWindow.currentSeq;
		i++
	) {
		const { partialLen, actualLen } = getPartialLengths(
			clientId,
			i,
			mergeTree,
			localSeq,
			mergeBlock,
		);

		if (partialLen && partialLen < 0) {
			assert.fail("Negative partial length returned");
		}
		assert.equal(partialLen, actualLen);
	}

	if (!expectedValues) {
		return;
	}

	for (const { seq, len, localSeq: expectedLocalSeq } of expectedValues) {
		const { partialLen, actualLen } = getPartialLengths(
			clientId,
			seq,
			mergeTree,
			expectedLocalSeq ?? localSeq,
			mergeBlock,
		);

		assert.equal(partialLen, len);
		assert.equal(actualLen, len);
	}
}

export function validateRefCount(collection?: LocalReferenceCollection): void {
	if (!collection) {
		return;
	}

	const expectedLength = [...collection].length;

	// eslint-disable-next-line @typescript-eslint/dot-notation
	assert.equal(collection["refCount"], expectedLength);
}

/**
 * Enable stricter partial length assertions inside tests
 *
 * Note that these assertions can be expensive, and so should not be enabled in
 * production code or tests that run through thousands of ops (e.g. the SharedString
 * fuzz tests).
 */
export function useStrictPartialLengthChecks(): void {
	beforeEach("Enable strict partial lengths", () => {
		PartialSequenceLengths.options.verifier = verifyPartialLengths;
		PartialSequenceLengths.options.verifyExpected = verifyExpectedPartialLengths;
	});

	afterEach("Disable strict partial lengths", () => {
		PartialSequenceLengths.options.verifier = undefined;
		PartialSequenceLengths.options.verifyExpected = undefined;
	});
}
