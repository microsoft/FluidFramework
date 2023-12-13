/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UnassignedSequenceNumber } from "../constants";
import { MergeTree } from "../mergeTree";
import { MergeTreeDeltaType } from "../ops";
import { PartialSequenceLengths, verify, verifyExpected } from "../partialLengths";
import { TextSegment } from "../textSegment";
import { insertSegments, insertText, markRangeRemoved, validatePartialLengths } from "./testUtils";

describe("partial lengths", () => {
	let mergeTree: MergeTree;
	const localClientId = 17;
	const remoteClientId = 18;
	const refSeq = 0;

	beforeEach(() => {
		PartialSequenceLengths.options.verifier = verify;
		PartialSequenceLengths.options.verifyExpected = verifyExpected;
		mergeTree = new MergeTree();
		insertSegments({
			mergeTree,
			pos: 0,
			segments: [TextSegment.make("hello world!")],
			refSeq,
			clientId: localClientId,
			seq: 0,
			opArgs: undefined,
		});

		mergeTree.startCollaboration(localClientId, /* minSeq: */ 0, /* currentSeq: */ 0);
	});

	afterEach(() => {
		PartialSequenceLengths.options.verifier = undefined;
		PartialSequenceLengths.options.verifyExpected = undefined;
	});

	it("passes with no additional ops", () => {
		validatePartialLengths(localClientId, mergeTree, [{ seq: refSeq, len: 12 }]);
	});

	describe("a single inserted element", () => {
		it("includes length of local insert for local view", () => {
			insertText({
				mergeTree,
				pos: 0,
				refSeq,
				clientId: localClientId,
				seq: refSeq + 1,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});

			validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 17 }]);
		});
		it("includes length of local insert for remote view", () => {
			insertText({
				mergeTree,
				pos: 0,
				refSeq,
				clientId: localClientId,
				seq: refSeq + 1,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});

			validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 17 }]);
		});
		it("includes length of remote insert for local view", () => {
			insertText({
				mergeTree,
				pos: 0,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});

			validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 17 }]);
		});
		it("includes length of remote insert for remote view", () => {
			insertText({
				mergeTree,
				pos: 0,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});

			validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 17 }]);
		});
	});

	describe("a single removed segment", () => {
		it("includes result of local delete for local view", () => {
			markRangeRemoved({
				mergeTree,
				start: 0,
				end: 12,
				refSeq,
				clientId: localClientId,
				seq: refSeq + 1,
				overwrite: false,
				opArgs: undefined as any,
			});

			validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 0 }]);
		});
		it("includes result of local delete for remote view", () => {
			markRangeRemoved({
				mergeTree,
				start: 0,
				end: 12,
				refSeq,
				clientId: localClientId,
				seq: refSeq + 1,
				overwrite: false,
				opArgs: undefined as any,
			});

			validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 0 }]);
		});
		it("includes result of remote delete for local view", () => {
			markRangeRemoved({
				mergeTree,
				start: 0,
				end: 12,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				overwrite: false,
				opArgs: undefined as any,
			});

			validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 0 }]);
		});
		it("includes result of remote delete for remote view", () => {
			markRangeRemoved({
				mergeTree,
				start: 0,
				end: 12,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				overwrite: false,
				opArgs: undefined as any,
			});

			validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 0 }]);
		});
	});

	describe("aggregation", () => {
		it("includes lengths from multiple permutations in single tree", () => {
			insertSegments({
				mergeTree,
				pos: 0,
				segments: [TextSegment.make("1")],
				refSeq,
				clientId: localClientId,
				seq: refSeq + 1,
				opArgs: undefined,
			});
			insertSegments({
				mergeTree,
				pos: 0,
				segments: [TextSegment.make("2")],
				refSeq: refSeq + 1,
				clientId: remoteClientId,
				seq: refSeq + 2,
				opArgs: undefined,
			});
			insertSegments({
				mergeTree,
				pos: 0,
				segments: [TextSegment.make("3")],
				refSeq: refSeq + 2,
				clientId: localClientId,
				seq: refSeq + 3,
				opArgs: undefined,
			});
			insertSegments({
				mergeTree,
				pos: 0,
				segments: [TextSegment.make("4")],
				refSeq: refSeq + 3,
				clientId: remoteClientId,
				seq: refSeq + 4,
				opArgs: undefined,
			});

			validatePartialLengths(localClientId, mergeTree, [{ seq: 4, len: 16 }]);
			validatePartialLengths(remoteClientId, mergeTree, [{ seq: 4, len: 16 }]);
		});

		it("is correct for different heights", () => {
			for (let i = 0; i < 100; i++) {
				insertText({
					mergeTree,
					pos: 0,
					refSeq: i,
					clientId: localClientId,
					seq: i + 1,
					text: "a",
					props: undefined,
					opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
				});

				validatePartialLengths(localClientId, mergeTree, [{ seq: i + 1, len: i + 13 }]);
				validatePartialLengths(remoteClientId, mergeTree, [{ seq: i + 1, len: i + 13 }]);
			}

			validatePartialLengths(localClientId, mergeTree, [{ seq: 100, len: 112 }]);
			validatePartialLengths(remoteClientId, mergeTree, [{ seq: 100, len: 112 }]);
		});
	});

	describe("concurrent, overlapping deletes", () => {
		it("concurrent remote changes are visible to local", () => {
			markRangeRemoved({
				mergeTree,
				start: 0,
				end: 10,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				overwrite: false,
				opArgs: undefined as any,
			});
			markRangeRemoved({
				mergeTree,
				start: 0,
				end: 10,
				refSeq,
				clientId: remoteClientId + 1,
				seq: refSeq + 2,
				overwrite: false,
				opArgs: undefined as any,
			});

			validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 2 }]);
		});
		it("concurrent local and remote changes are visible", () => {
			markRangeRemoved({
				mergeTree,
				start: 0,
				end: 10,
				refSeq,
				clientId: localClientId,
				seq: refSeq + 1,
				overwrite: false,
				opArgs: undefined as any,
			});
			markRangeRemoved({
				mergeTree,
				start: 0,
				end: 10,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 2,
				overwrite: false,
				opArgs: undefined as any,
			});

			validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 2 }]);
			validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 2 }]);
		});
		it("concurrent remote and unsequenced local changes are visible", () => {
			markRangeRemoved({
				mergeTree,
				start: 0,
				end: 10,
				refSeq,
				clientId: localClientId,
				seq: UnassignedSequenceNumber,
				overwrite: false,
				opArgs: undefined as any,
			});
			markRangeRemoved({
				mergeTree,
				start: 0,
				end: 10,
				refSeq,
				clientId: remoteClientId,
				seq: refSeq + 1,
				overwrite: false,
				opArgs: undefined as any,
			});

			validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 2 }]);
			validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 2 }]);
		});
	});
});
