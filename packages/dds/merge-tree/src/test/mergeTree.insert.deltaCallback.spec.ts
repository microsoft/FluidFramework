/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MergeTree } from "../mergeTree.js";
import { MergeTreeMaintenanceType } from "../mergeTreeDeltaCallback.js";
import { Marker } from "../mergeTreeNodes.js";
import { MergeTreeDeltaType, ReferenceType } from "../ops.js";
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

	describe("insertText", () => {
		it("Insert starting text", () => {
			let eventCalled: number = 0;

			mergeTree.mergeTreeDeltaCallback = (opArgs, deltaArgs): void => {
				eventCalled++;
			};

			mergeTree.insertSegments(
				0,
				[TextSegment.make("more ")],
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				{ op: { type: MergeTreeDeltaType.INSERT } },
			);

			assert.equal(eventCalled, 1);
		});

		it("Insert ending text", () => {
			const textLength = mergeTree.getLength(mergeTree.localPerspective);
			let eventCalled: number = 0;

			mergeTree.mergeTreeDeltaCallback = (opArgs, deltaArgs): void => {
				eventCalled++;
			};

			mergeTree.insertSegments(
				textLength,
				[TextSegment.make("more ")],
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				{ op: { type: MergeTreeDeltaType.INSERT } },
			);

			assert.equal(eventCalled, 1);
		});

		it("Insert middle text", () => {
			const count = countOperations(mergeTree);

			mergeTree.insertSegments(
				4,
				[TextSegment.make("more ")],
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				{ op: { type: MergeTreeDeltaType.INSERT } },
			);

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.INSERT]: 1,
				[MergeTreeMaintenanceType.SPLIT]: 1,
			});
		});

		it("Insert text remote", () => {
			const remoteClient = makeRemoteClient({ clientId: 35 });
			let remoteSequenceNumber = currentSequenceNumber;

			const count = countOperations(mergeTree);

			mergeTree.insertSegments(
				0,
				[TextSegment.make("more ")],
				remoteClient.perspectiveAt({ refSeq: currentSequenceNumber }),
				remoteClient.stampAt({ seq: ++remoteSequenceNumber }),
				{ op: { type: MergeTreeDeltaType.INSERT } },
			);

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.INSERT]: 1,
			});
		});
	});
	describe("insertMarker", () => {
		it("Insert marker", () => {
			const count = countOperations(mergeTree);

			mergeTree.insertSegments(
				4,
				[Marker.make(ReferenceType.Simple)],
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				{ op: { type: MergeTreeDeltaType.INSERT } },
			);

			assert.deepStrictEqual(count, {
				[MergeTreeDeltaType.INSERT]: 1,
				[MergeTreeMaintenanceType.SPLIT]: 1,
			});
		});
	});
});
