/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import fs from "node:fs";

import { LocalReferenceCollection } from "../localReference.js";
import { MergeTree } from "../mergeTree.js";
import type {
	IMergeTreeDeltaCallbackArgs,
	IMergeTreeMaintenanceCallbackArgs,
} from "../mergeTreeDeltaCallback.js";
import { walkAllChildSegments } from "../mergeTreeNodeWalk.js";
import { MergeBlock } from "../mergeTreeNodes.js";
import {
	PartialSequenceLengths,
	verifyExpectedPartialLengths,
	verifyPartialLengths,
} from "../partialLengths.js";
import {
	LocalReconnectingPerspective,
	PriorPerspective,
	type Perspective,
} from "../perspective.js";
import type { OperationStamp } from "../stamps.js";
import { ClientTestHelper } from "./clientTestHelper.js";

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

export interface MockRemoteClient {
	perspectiveAt(args: { refSeq: number }): Perspective;
	stampAt(args: { seq: number }): OperationStamp;
	/**
	 * Short client id for this client.
	 */
	id: number;
}

/**
 * Creates a "mock remote client" which allows ergonomically generating {@link Perspective}s and {@link OperationStamp}s
 * for use in tests that interact directly with a {@link MergeTree}.
 *
 * Example:
 *
 * ```typescript
 * let seq = 0;
 * const remoteClient = makeRemoteClient({ clientId: 18 });
 *
 * mergeTree.insertSegments(
 * 0,
 * [TextSegment.make("some text")],
 * remoteClient.perspectiveAt({ refSeq: seq }),
 * remoteClient.stampAt({ seq: ++seq }),
 * undefined
 * );
 * ```
 */
export function makeRemoteClient({ clientId }: { clientId: number }): MockRemoteClient {
	return {
		perspectiveAt({ refSeq }: { refSeq: number }): Perspective {
			return new PriorPerspective(refSeq, clientId);
		},
		stampAt({ seq }: { seq: number }): OperationStamp {
			return { seq, clientId };
		},
		id: clientId,
	};
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
		localSeq === undefined
			? new PriorPerspective(seq, clientId)
			: new LocalReconnectingPerspective(seq, clientId, localSeq);
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

function createObliterateTestBody({ action, expectedText }: ObliterateTestArgs): () => void {
	return () => {
		const events: number[] = [];

		const helper = new ClientTestHelper({
			mergeTreeEnableSidedObliterate: true,
		});
		helper.clients.A.on("delta", (opArgs, deltaArgs) => {
			events.push(deltaArgs.operation);
		});
		action(helper);
		helper.processAllOps();

		helper.logger.validate({ baseText: expectedText });
	};
}

interface ObliterateTestArgs {
	title: string;
	action: (helper: ClientTestHelper) => void;
	expectedText: string;
}

export function itCorrectlyObliterates(args: ObliterateTestArgs): Mocha.Test {
	return it(args.title, createObliterateTestBody(args));
}
itCorrectlyObliterates.skip = (args: ObliterateTestArgs) =>
	it.skip(args.title, createObliterateTestBody(args));
itCorrectlyObliterates.only = (args: ObliterateTestArgs) =>
	it.only(args.title, createObliterateTestBody(args));
