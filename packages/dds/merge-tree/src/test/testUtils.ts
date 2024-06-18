/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import fs from "fs";

import { UnassignedSequenceNumber } from "../constants.js";
import { LocalReferenceCollection } from "../localReference.js";
import { MergeTree } from "../mergeTree.js";
import { IMergeTreeDeltaOpArgs } from "../mergeTreeDeltaCallback.js";
import { walkAllChildSegments } from "../mergeTreeNodeWalk.js";
import { MergeBlock, ISegment, Marker } from "../mergeTreeNodes.js";
import { ReferenceType } from "../ops.js";
import {
	PartialSequenceLengths,
	verifyExpectedPartialLengths,
	verifyPartialLengths,
} from "../partialLengths.js";
import { PropertySet } from "../properties.js";
import { TextSegment } from "../textSegment.js";

import { loadText } from "./text.js";

export function loadTextFromFile(filename: string, mergeTree: MergeTree, segLimit = 0) {
	const content = fs.readFileSync(filename, "utf8");
	return loadText(content, mergeTree, segLimit);
}

export function loadTextFromFileWithMarkers(
	filename: string,
	mergeTree: MergeTree,
	segLimit = 0,
) {
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
}: InsertMarkerArgs) {
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
}: InsertTextArgs) {
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
	segments: ISegment[];
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
	overwrite = false,
	opArgs,
}: MarkRangeRemovedArgs): void {
	mergeTree.markRangeRemoved(start, end, refSeq, clientId, seq, overwrite, opArgs);
}

export function nodeOrdinalsHaveIntegrity(block: MergeBlock): boolean {
	const olen = block.ordinal.length;
	for (let i = 0; i < block.childCount; i++) {
		if (block.children[i].ordinal) {
			if (olen !== block.children[i].ordinal.length - 1) {
				console.log("node integrity issue");
				return false;
			}
			if (i > 0) {
				if (block.children[i].ordinal <= block.children[i - 1].ordinal) {
					console.log("node sib integrity issue");
					return false;
				}
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
export function countOperations(mergeTree: MergeTree) {
	const counts = {};

	assert.strictEqual(mergeTree.mergeTreeDeltaCallback, undefined);
	assert.strictEqual(mergeTree.mergeTreeMaintenanceCallback, undefined);

	const fn = (deltaArgs) => {
		const previous = counts[deltaArgs.operation] as undefined | number;
		counts[deltaArgs.operation] = previous === undefined ? 1 : previous + 1;
	};

	mergeTree.mergeTreeDeltaCallback = (opArgs, deltaArgs) => {
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
) {
	const partialLen = mergeBlock.partialLengths?.getPartialLength(seq, clientId, localSeq);

	let actualLen = 0;

	const isInserted = (segment: ISegment) =>
		segment.seq === undefined ||
		(segment.seq !== UnassignedSequenceNumber && segment.seq <= seq) ||
		(localSeq !== undefined &&
			segment.seq === UnassignedSequenceNumber &&
			segment.localSeq !== undefined &&
			segment.localSeq <= localSeq);

	const isRemoved = (segment: ISegment) =>
		segment.removedSeq !== undefined &&
		((localSeq !== undefined &&
			segment.removedSeq === UnassignedSequenceNumber &&
			segment.localRemovedSeq !== undefined &&
			segment.localRemovedSeq <= localSeq) ||
			(segment.removedSeq !== UnassignedSequenceNumber && segment.removedSeq <= seq));

	const isMoved = (segment: ISegment) =>
		segment.movedSeq !== undefined &&
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

export function validateRefCount(collection?: LocalReferenceCollection) {
	if (!collection) {
		return;
	}

	const expectedLength = Array.from(collection).length;

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
export function useStrictPartialLengthChecks() {
	beforeEach(() => {
		PartialSequenceLengths.options.verifier = verifyPartialLengths;
		PartialSequenceLengths.options.verifyExpected = verifyExpectedPartialLengths;
	});

	afterEach(() => {
		PartialSequenceLengths.options.verifier = undefined;
		PartialSequenceLengths.options.verifyExpected = undefined;
	});
}
