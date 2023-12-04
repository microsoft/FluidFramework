/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MergeTreeDeltaType } from "../ops";
import { MergeTreeMaintenanceType } from "../mergeTreeDeltaCallback";
import { LocalClientId, UnassignedSequenceNumber, UniversalSequenceNumber } from "../constants";
import { TextSegment } from "../textSegment";
import { MergeTree } from "../mergeTree";
import { countOperations, insertSegments, insertText, markRangeRemoved } from "./testUtils";

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
					foo: "bar",
				},
				currentSequenceNumber,
				localClientId,
				UnassignedSequenceNumber,
				undefined as any,
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
					foo: "bar",
				},
				currentSequenceNumber,
				localClientId,
				++currentSequenceNumber,
				undefined as any,
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
					foo: "bar",
				},
				currentSequenceNumber,
				localClientId,
				UnassignedSequenceNumber,
				undefined as any,
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
					foo: "bar",
				},
				currentSequenceNumber,
				localClientId,
				UnassignedSequenceNumber,
				undefined as any,
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
				opArgs: undefined as any,
			});

			const count = countOperations(mergeTree);

			mergeTree.annotateRange(
				3,
				8,
				{
					foo: "bar",
				},
				currentSequenceNumber,
				localClientId,
				UnassignedSequenceNumber,
				undefined as any,
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
				opArgs: undefined as any,
			});

			const count = countOperations(mergeTree);

			mergeTree.annotateRange(
				4,
				6,
				{
					foo: "bar",
				},
				remoteSequenceNumber,
				remoteClientId,
				++remoteSequenceNumber,
				undefined as any,
			);

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.ANNOTATE]: 1,
				[MergeTreeMaintenanceType.SPLIT]: 2,
			});
		});
	});
});
