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
import { MergeTreeDeltaType, ReferenceType } from "../ops.js";
import { TextSegment } from "../textSegment.js";

import { countOperations, insertMarker, insertSegments, insertText } from "./testUtils.js";

describe("MergeTree", () => {
	let mergeTree: MergeTree;
	const localClientId = 17;
	let currentSequenceNumber: number;
	beforeEach(() => {
		mergeTree = new MergeTree();
		insertSegments({
			mergeTree,
			pos: 0,
			segments: [TextSegment.make("hello world!")],
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

	describe("insertText", () => {
		it("Insert starting text", () => {
			let eventCalled: number = 0;

			mergeTree.mergeTreeDeltaCallback = (opArgs, deltaArgs): void => {
				eventCalled++;
			};

			insertText({
				mergeTree,
				pos: 0,
				refSeq: currentSequenceNumber,
				clientId: localClientId,
				seq: UnassignedSequenceNumber,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});

			assert.equal(eventCalled, 1);
		});

		it("Insert ending text", () => {
			const textLength = mergeTree.getLength(mergeTree.localPerspective);
			let eventCalled: number = 0;

			mergeTree.mergeTreeDeltaCallback = (opArgs, deltaArgs): void => {
				eventCalled++;
			};

			insertText({
				mergeTree,
				pos: textLength,
				refSeq: currentSequenceNumber,
				clientId: localClientId,
				seq: UnassignedSequenceNumber,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});

			assert.equal(eventCalled, 1);
		});

		it("Insert middle text", () => {
			const count = countOperations(mergeTree);

			insertText({
				mergeTree,
				pos: 4,
				refSeq: currentSequenceNumber,
				clientId: localClientId,
				seq: UnassignedSequenceNumber,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.INSERT]: 1,
				[MergeTreeMaintenanceType.SPLIT]: 1,
			});
		});

		it("Insert text remote", () => {
			const remoteClientId: number = 35;
			let remoteSequenceNumber = currentSequenceNumber;

			const count = countOperations(mergeTree);

			insertText({
				mergeTree,
				pos: 0,
				refSeq: currentSequenceNumber,
				clientId: remoteClientId,
				seq: ++remoteSequenceNumber,
				text: "more ",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.INSERT]: 1,
			});
		});
	});
	describe("insertMarker", () => {
		it("Insert marker", () => {
			const count = countOperations(mergeTree);

			insertMarker({
				mergeTree,
				pos: 4,
				refSeq: currentSequenceNumber,
				clientId: localClientId,
				seq: UnassignedSequenceNumber,
				behaviors: ReferenceType.Simple,
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.INSERT]: 1,
				[MergeTreeMaintenanceType.SPLIT]: 1,
			});
		});
	});
});
