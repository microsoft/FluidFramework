/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

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
			[TextSegment.make("hello world")],
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
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
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
			mergeTree.insertSegments(
				4,
				[TextSegment.make("a")],
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				undefined,
			);

			const count = countOperations(mergeTree);

			mergeTree.annotateRange(
				3,
				8,
				{
					props: { foo: "bar" },
				},
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				undefined as never,
			);

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.ANNOTATE]: 1,
				[MergeTreeMaintenanceType.SPLIT]: 2,
			});
		});

		it("Annotate over remote insertion", () => {
			const remoteClient = makeRemoteClient({ clientId: 35 });
			let remoteSequenceNumber = currentSequenceNumber;

			mergeTree.insertSegments(
				4,
				[TextSegment.make("a")],
				remoteClient.perspectiveAt({ refSeq: remoteSequenceNumber }),
				remoteClient.stampAt({ seq: ++remoteSequenceNumber }),
				undefined as never,
			);

			const count = countOperations(mergeTree);

			mergeTree.annotateRange(
				3,
				8,
				{
					props: { foo: "bar" },
				},
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				undefined as never,
			);

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.ANNOTATE]: 1,
				[MergeTreeMaintenanceType.SPLIT]: 2,
			});
		});

		it("Annotate over remote deletion", () => {
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

			mergeTree.annotateRange(
				3,
				8,
				{
					props: { foo: "bar" },
				},
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				undefined as never,
			);

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.ANNOTATE]: 1,
				[MergeTreeMaintenanceType.SPLIT]: 2,
			});
		});

		it("Remote annotate within local deletion", () => {
			const remoteClient = makeRemoteClient({ clientId: 35 });
			let remoteSequenceNumber = currentSequenceNumber;

			mergeTree.markRangeRemoved(
				3,
				8,
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				undefined as never,
			);

			const count = countOperations(mergeTree);

			mergeTree.annotateRange(
				4,
				6,
				{
					props: { foo: "bar" },
				},
				remoteClient.perspectiveAt({ refSeq: remoteSequenceNumber }),
				remoteClient.stampAt({ seq: ++remoteSequenceNumber }),
				undefined as never,
			);

			assert.deepStrictEqual(count, {
				[MergeTreeMaintenanceType.SPLIT]: 2,
			});
		});
	});
});
