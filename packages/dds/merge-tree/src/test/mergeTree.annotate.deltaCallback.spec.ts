/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	LocalClientId,
	UnassignedSequenceNumber,
	UniversalSequenceNumber,
} from "../constants.js";
import { MergeTree } from "../mergeTree.js";
import { MergeTreeMaintenanceType } from "../mergeTreeDeltaCallback.js";
import { MergeTreeDeltaType } from "../ops.js";
import { TextSegment } from "../textSegment.js";

import { countOperations, insertSegments, insertText, markRangeRemoved } from "./testUtils.js";
import type { OperationStamp } from "../mergeTreeNodes.js";
import { PriorPerspective } from "../perspective.js";

function mintLocalChange(tree: MergeTree): OperationStamp {
	return {
		seq: UnassignedSequenceNumber,
		clientId: tree.collabWindow.clientId,
		localSeq: ++tree.collabWindow.currentSeq,
	};
}

describe("MergeTree", () => {
	let mergeTree: MergeTree;
	const localClientId = 17;
	let currentSequenceNumber: number;
	beforeEach(() => {
		mergeTree = new MergeTree();
		insertSegments({
			mergeTree,
			pos: 0,
			segments: [TextSegment.make("hello world")],
			refSeq: UniversalSequenceNumber,
			clientId: LocalClientId,
			seq: UniversalSequenceNumber,
			opArgs: undefined,
		});

		currentSequenceNumber = 0;
		mergeTree.startCollaboration(
			localClientId,
			/* minSeq: */ currentSequenceNumber,
			/* currentSeq: */ currentSequenceNumber,
		);
	});

	describe("annotateRange", () => {
		it("Event on annotation", () => {
			const count = countOperations(mergeTree);

			mergeTree.annotateRange(
				4,
				6,
				{
					props: { foo: "bar" },
				},
				mergeTree.localPerspective,
				mintLocalChange(mergeTree),
				undefined as never,
			);

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.ANNOTATE]: 1,
				[MergeTreeMaintenanceType.SPLIT]: 2,
			});
		});

		it("No event on annotation of empty range", () => {
			const count = countOperations(mergeTree);
			mergeTree.annotateRange(
				3,
				3,
				{
					props: { foo: "bar" },
				},
				mergeTree.localPerspective,
				{ seq: ++currentSequenceNumber, clientId: localClientId },
				undefined as never,
			);

			assert.deepStrictEqual(count, {
				[MergeTreeMaintenanceType.SPLIT]: 1,
			});
		});

		it("Annotate over local insertion", () => {
			insertText({
				mergeTree,
				pos: 4,
				refSeq: currentSequenceNumber,
				clientId: localClientId,
				seq: UnassignedSequenceNumber,
				text: "a",
				props: undefined,
				opArgs: undefined,
			});

			const count = countOperations(mergeTree);

			mergeTree.annotateRange(
				3,
				8,
				{
					props: { foo: "bar" },
				},
				mergeTree.localPerspective,
				mintLocalChange(mergeTree),
				undefined as never,
			);

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.ANNOTATE]: 1,
				[MergeTreeMaintenanceType.SPLIT]: 2,
			});
		});

		it("Annotate over remote insertion", () => {
			const remoteClientId: number = 35;
			let remoteSequenceNumber = currentSequenceNumber;

			insertText({
				mergeTree,
				pos: 4,
				refSeq: remoteSequenceNumber,
				clientId: remoteClientId,
				seq: ++remoteSequenceNumber,
				text: "a",
				props: undefined,
				opArgs: undefined,
			});

			const count = countOperations(mergeTree);

			mergeTree.annotateRange(
				3,
				8,
				{
					props: { foo: "bar" },
				},
				mergeTree.localPerspective,
				mintLocalChange(mergeTree),
				undefined as never,
			);

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.ANNOTATE]: 1,
				[MergeTreeMaintenanceType.SPLIT]: 2,
			});
		});

		it("Annotate over remote deletion", () => {
			const remoteClientId: number = 35;
			let remoteSequenceNumber = currentSequenceNumber;

			markRangeRemoved({
				mergeTree,
				start: 4,
				end: 6,
				refSeq: remoteSequenceNumber,
				clientId: remoteClientId,
				seq: ++remoteSequenceNumber,
				overwrite: false,
				opArgs: undefined as never,
			});

			const count = countOperations(mergeTree);

			mergeTree.annotateRange(
				3,
				8,
				{
					props: { foo: "bar" },
				},
				mergeTree.localPerspective,
				mintLocalChange(mergeTree),
				undefined as never,
			);

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.ANNOTATE]: 1,
				[MergeTreeMaintenanceType.SPLIT]: 2,
			});
		});

		it("Remote annotate within local deletion", () => {
			const remoteClientId: number = 35;
			let remoteSequenceNumber = currentSequenceNumber;

			markRangeRemoved({
				mergeTree,
				start: 3,
				end: 8,
				refSeq: currentSequenceNumber,
				clientId: localClientId,
				seq: UnassignedSequenceNumber,
				overwrite: false,
				opArgs: undefined as never,
			});

			const count = countOperations(mergeTree);

			mergeTree.annotateRange(
				4,
				6,
				{
					props: { foo: "bar" },
				},
				new PriorPerspective(remoteSequenceNumber, remoteClientId),
				{ seq: ++remoteSequenceNumber, clientId: remoteClientId },
				undefined as never,
			);

			assert.deepStrictEqual(count, {
				[MergeTreeMaintenanceType.SPLIT]: 2,
			});
		});
	});
});
