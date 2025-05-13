/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import { MergeTree } from "../mergeTree.js";
import { MergeTreeMaintenanceType } from "../mergeTreeDeltaCallback.js";
import { MergeTreeDeltaType } from "../ops.js";
import { TextSegment } from "../textSegment.js";

import { countOperations, makeRemoteClient } from "./testUtils.js";

describe("MergeTree", () => {
	let mergeTree: MergeTree;
	const localClientId = 17;
	let currentSequenceNumber: number;
	beforeEach(() => {
		mergeTree = new MergeTree();
		mergeTree.insertSegments(
			0,
			[TextSegment.make("hello world!")],
			mergeTree.localPerspective,
			mergeTree.collabWindow.mintNextLocalOperationStamp(),
			undefined,
		);

		currentSequenceNumber = 0;
		mergeTree.startCollaboration(
			localClientId,
			/* minSeq: */ currentSequenceNumber,
			/* currentSeq: */ currentSequenceNumber,
		);
	});

	describe("markRangeRemoved", () => {
		it("Event on Removal", () => {
			const count = countOperations(mergeTree);

			mergeTree.markRangeRemoved(
				4,
				6,
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				undefined as never,
			);

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.REMOVE]: 1,
				[MergeTreeMaintenanceType.SPLIT]: 2,
			});
		});

		// Verify that zamboni unlinks a removed segment and raises the appropriate maintenance event.
		it("Event on Unlink", () => {
			const count = countOperations(mergeTree);

			const start = 4;
			const end = 6;

			mergeTree.markRangeRemoved(
				start,
				end,
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				undefined as never,
			);

			// In order for the removed segment to unlinked by zamboni, we need to ACK the segment
			// and advance the collaboration window's minSeq past the removedSeq.
			mergeTree.ackOp({
				op: {
					pos1: start,
					pos2: end,
					type: MergeTreeDeltaType.REMOVE,
				},
				sequencedMessage: {
					sequenceNumber: ++currentSequenceNumber,
				} as unknown as ISequencedDocumentMessage,
			});

			// Move currentSeq/minSeq past the seq# at which the removal was ACKed.
			mergeTree.collabWindow.currentSeq = currentSequenceNumber;
			mergeTree.setMinSeq(currentSequenceNumber);

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.REMOVE]: 1,
				[MergeTreeMaintenanceType.SPLIT]: 2,
				[MergeTreeMaintenanceType.UNLINK]: 1,
				[MergeTreeMaintenanceType.ACKNOWLEDGED]: 1,
			});
		});

		it("Remote Before Local", () => {
			const remoteClient = makeRemoteClient({ clientId: 35 });
			let remoteSequenceNumber = currentSequenceNumber;

			mergeTree.markRangeRemoved(
				4,
				6,
				remoteClient.perspectiveAt({ refSeq: remoteSequenceNumber }),
				remoteClient.stampAt({ seq: ++remoteSequenceNumber }),
				undefined as never,
			);

			const count = countOperations(mergeTree);

			mergeTree.markRangeRemoved(
				3,
				5,
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				undefined as never,
			);

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.REMOVE]: 1,
				[MergeTreeMaintenanceType.SPLIT]: 2,
			});
		});

		it("Local Before Remote", () => {
			const remoteClient = makeRemoteClient({ clientId: 35 });
			let remoteSequenceNumber = currentSequenceNumber;

			mergeTree.markRangeRemoved(
				4,
				6,
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				undefined as never,
			);

			const count = countOperations(mergeTree);

			mergeTree.markRangeRemoved(
				3,
				5,
				remoteClient.perspectiveAt({ refSeq: remoteSequenceNumber }),
				remoteClient.stampAt({ seq: ++remoteSequenceNumber }),
				undefined as never,
			);

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.REMOVE]: 1,
				[MergeTreeMaintenanceType.SPLIT]: 2,
			});
		});

		it("Local delete shadows remote", () => {
			const remoteClient = makeRemoteClient({ clientId: 35 });
			let remoteSequenceNumber = currentSequenceNumber;

			mergeTree.markRangeRemoved(
				3,
				6,
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				undefined as never,
			);

			const count = countOperations(mergeTree);

			mergeTree.markRangeRemoved(
				4,
				5,
				remoteClient.perspectiveAt({ refSeq: remoteSequenceNumber }),
				remoteClient.stampAt({ seq: ++remoteSequenceNumber }),
				undefined as never,
			);

			assert.deepStrictEqual(count, {
				/* MergeTreeDeltaType.REMOVE is absent as it should not be fired. */
				[MergeTreeMaintenanceType.SPLIT]: 2,
			});
		});
	});
});
