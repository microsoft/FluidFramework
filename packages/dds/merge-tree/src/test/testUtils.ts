/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import fs from "node:fs";

import { UnassignedSequenceNumber } from "../constants.js";
import { LocalReferenceCollection } from "../localReference.js";
import { MergeTree } from "../mergeTree.js";
import {
	IMergeTreeDeltaOpArgs,
	type IMergeTreeDeltaCallbackArgs,
	type IMergeTreeMaintenanceCallbackArgs,
} from "../mergeTreeDeltaCallback.js";
import { walkAllChildSegments } from "../mergeTreeNodeWalk.js";
import { MergeBlock, ISegmentPrivate, Marker } from "../mergeTreeNodes.js";
import { ReferenceType } from "../ops.js";
import {
	PartialSequenceLengths,
	verifyExpectedPartialLengths,
	verifyPartialLengths,
} from "../partialLengths.js";
import { PropertySet } from "../properties.js";
import { TextSegment } from "../textSegment.js";

import { loadText } from "./text.js";
import { LocalReconnectingPerspective, PriorPerspective } from "../perspective.js";

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
	const localSeq =
		seq === UnassignedSequenceNumber ? ++mergeTree.collabWindow.localSeq : undefined;

	const perspective =
		seq === UnassignedSequenceNumber || clientId === mergeTree.collabWindow.clientId
			? mergeTree.localPerspective
			: new PriorPerspective(refSeq, clientId);
	mergeTree.insertSegments(
		pos,
		[Marker.make(behaviors, props)],
		perspective,
		{ clientId, seq, localSeq },
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

// TODO: This function and friends are problematic when used with clients and not an isolated mergeTree, since they don't update
// collab window sequence numbers. See comment on obliterate.partialLength.spec.ts.
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
	const localSeq =
		seq === UnassignedSequenceNumber ? ++mergeTree.collabWindow.localSeq : undefined;
	const perspective =
		seq === UnassignedSequenceNumber || clientId === mergeTree.collabWindow.clientId
			? mergeTree.localPerspective
			: new PriorPerspective(refSeq, clientId);
	mergeTree.insertSegments(
		pos,
		[TextSegment.make(text, props)],
		perspective,
		{ clientId, seq, localSeq },
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
	const localSeq =
		seq === UnassignedSequenceNumber ? ++mergeTree.collabWindow.localSeq : undefined;

	const perspective =
		seq === UnassignedSequenceNumber || clientId === mergeTree.collabWindow.clientId
			? mergeTree.localPerspective
			: new PriorPerspective(refSeq, clientId);
	mergeTree.insertSegments(pos, segments, perspective, { clientId, seq, localSeq }, opArgs);
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
	const localSeq =
		seq === UnassignedSequenceNumber ? ++mergeTree.collabWindow.localSeq : undefined;

	const perspective =
		seq === UnassignedSequenceNumber || clientId === mergeTree.collabWindow.clientId
			? mergeTree.localPerspective
			: new PriorPerspective(refSeq, clientId);

	mergeTree.markRangeRemoved(
		start,
		end,
		perspective,
		{ type: "set", clientId, seq, localSeq },
		opArgs,
	);
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
	const localSeq =
		seq === UnassignedSequenceNumber ? ++mergeTree.collabWindow.localSeq : undefined;

	const perspective =
		seq === UnassignedSequenceNumber || clientId === mergeTree.collabWindow.clientId
			? mergeTree.localPerspective
			: new PriorPerspective(refSeq, clientId);

	mergeTree.obliterateRange(
		start,
		end,
		perspective,
		{ type: "slice", clientId, seq, localSeq },
		opArgs,
	);
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

	const perspective =
		localSeq !== undefined
			? new LocalReconnectingPerspective(seq, clientId, localSeq)
			: new PriorPerspective(seq, clientId);
	let actualLen = 0;

	walkAllChildSegments(mergeBlock, (segment) => {
		if (perspective.isSegmentPresent(segment)) {
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
	expectedValues: { seq: number; len: number; localSeq?: number }[] = [],
	minRefSeqForLocalSeq = new Map<number, number>(),
	mergeBlock: MergeBlock = mergeTree.root,
): void {
	function validatePartialLengthAt(seq: number, localSeq?: number, len?: number): void {
		const { partialLen, actualLen } = getPartialLengths(
			clientId,
			seq,
			mergeTree,
			localSeq,
			mergeBlock,
		);

		if (partialLen && partialLen < 0) {
			assert.fail("Negative partial length returned");
		}
		assert.equal(
			partialLen,
			actualLen,
			"Partial length did not match value obtained from walking all segments in the block.",
		);
		if (len !== undefined) {
			assert.equal(partialLen, len, "Partial length did not match expected value.");
		}
	}

	if (clientId === mergeTree.collabWindow.clientId) {
		mergeTree.computeLocalPartials(0);
		// We don't add entries to the local partial lengths entries that ensure that a query for a given localSeq includes any dependent removes.
		// For example, in a scenario where segments are inserted between seqs 1 and 10 causing a length increase of 10, but then this entire range
		// is removed locally at localSeq 5, computing the length of the block using partial lengths at (seq: 1, localSeq: 5) can yield a negative
		// result since the computation "sees" the removal of length 10 but only one of the inserts that this removal affected.
		//
		// In the production codepath, this doesn't matter because we only ever query for (refSeq, localSeq) for which the refSeq is at or above the original
		// context in which the edit was applied, which means this 'dependency' is always included in the query.
		// We could fix it if we wanted to by using a similar solution to what we do for non-local edits (add adjustments to the unsequenced lengths
		// to ensure whenever the removal of a segment applies, so does existence of that segment), at which point we could validate for a wider range
		// of local perspectives.
		for (const [localSeq, minRefSeq] of minRefSeqForLocalSeq.entries()) {
			for (let refSeq = minRefSeq; refSeq <= mergeTree.collabWindow.currentSeq; refSeq++) {
				validatePartialLengthAt(refSeq, localSeq);
			}
		}
	} else {
		// We don't use partial lengths for the local client unless it's a reconnecting perspective (we just use the mergeBlock's cachedLength field).
		for (
			let seq = mergeTree.collabWindow.minSeq + 1;
			seq <= mergeTree.collabWindow.currentSeq;
			seq++
		) {
			validatePartialLengthAt(seq);
		}
	}

	for (const { seq, len, localSeq } of expectedValues) {
		validatePartialLengthAt(seq, localSeq, len);
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
