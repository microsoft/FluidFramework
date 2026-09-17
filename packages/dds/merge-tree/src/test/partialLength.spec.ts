/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MergeTree } from "../mergeTree.js";
import { MergeBlock } from "../mergeTreeNodes.js";
import { MergeTreeDeltaType } from "../ops.js";
import { PartialSequenceLengths } from "../partialLengths.js";
import type { OperationStamp } from "../stamps.js";
import { TextSegment } from "../textSegment.js";

import {
	makeRemoteClient,
	useStrictPartialLengthChecks,
	validatePartialLengths,
} from "./testUtils.js";

describe("partial lengths", () => {
	let mergeTree: MergeTree;
	const localClientId = 17;
	const remoteClientId = 18;
	const refSeq = 0;

	const ackedLocalClientStamp = (seq: number): OperationStamp => ({
		seq,
		clientId: localClientId,
	});

	const remoteClient1 = makeRemoteClient({ clientId: 18 });

	useStrictPartialLengthChecks();

	beforeEach(() => {
		mergeTree = new MergeTree();
		mergeTree.insertSegments(
			0,
			[TextSegment.make("hello world!")],
			mergeTree.localPerspective,
			mergeTree.collabWindow.mintNextLocalOperationStamp(),
			undefined,
		);

		mergeTree.startCollaboration(localClientId, /* minSeq: */ 0, /* currentSeq: */ 0);
	});

	it("passes with no additional ops", () => {
		validatePartialLengths(localClientId, mergeTree, [{ seq: refSeq, len: 12 }]);
	});

	describe("scalar queries", () => {
		it("reports zero count and baseline for empty partial lengths", () => {
			for (const computeLocalPartials of [false, true]) {
				const partials = new PartialSequenceLengths(refSeq, computeLocalPartials);
				assert.equal(partials.getSegmentCount(), 0);
				assert.equal(partials.getBaselineLength(), 0);
			}
		});

		it("preserves the count and baseline when aggregating child partials", () => {
			mergeTree.insertSegments(
				5,
				[TextSegment.make("more ")],
				remoteClient1.perspectiveAt({ refSeq }),
				remoteClient1.stampAt({ seq: 1 }),
				undefined,
			);
			mergeTree.root.partialLengths = PartialSequenceLengths.combine(
				mergeTree.root,
				mergeTree.collabWindow,
			);
			const parent = new MergeBlock(1);
			parent.children[0] = mergeTree.root;
			const combined = PartialSequenceLengths.combine(parent, mergeTree.collabWindow);

			for (const partials of [mergeTree.root.partialLengths, combined]) {
				assert.equal(partials.getSegmentCount(), 3);
				assert.equal(partials.getBaselineLength(), 12);
				assert.equal(partials.getPartialLength(1, remoteClientId), 17);
			}
		});

		it("reports the baseline at the current minimum sequence", () => {
			mergeTree.insertSegments(
				5,
				[TextSegment.make("more ")],
				remoteClient1.perspectiveAt({ refSeq }),
				remoteClient1.stampAt({ seq: 1 }),
				undefined,
			);
			mergeTree.collabWindow.currentSeq = 1;
			mergeTree.collabWindow.minSeq = 1;
			const partials = PartialSequenceLengths.combine(mergeTree.root, mergeTree.collabWindow);

			assert.equal(partials.getSegmentCount(), 3);
			assert.equal(partials.getBaselineLength(), 17);
			assert.equal(partials.getPartialLength(1, remoteClientId), 17);
		});
	});

	it("propagates only the last invalidation without changing calculated lengths", () => {
		const childPartials = mergeTree.root.partialLengths;
		assert(childPartials !== undefined);
		const parent = new MergeBlock(1);
		parent.children[0] = mergeTree.root;
		const parentPartials = PartialSequenceLengths.combine(parent, mergeTree.collabWindow);
		parent.partialLengths = parentPartials;
		const ancestor = new MergeBlock(1);
		ancestor.children[0] = parent;
		const ancestorPartials = PartialSequenceLengths.combine(ancestor, mergeTree.collabWindow);
		ancestor.partialLengths = ancestorPartials;

		childPartials.invalidateIncrementalPropagation(1);
		childPartials.invalidateIncrementalPropagation(2);
		assert.equal(childPartials.getPartialLength(2, remoteClientId), 12);

		parentPartials.update(parent, 1, remoteClientId, mergeTree.collabWindow);
		assert.equal(parent.partialLengths, parentPartials);
		assert.equal(parent.partialLengths.getSegmentCount(), 1);
		assert.equal(parent.partialLengths.getPartialLength(1, remoteClientId), 12);

		parentPartials.update(parent, 2, remoteClientId, mergeTree.collabWindow);
		assert.notEqual(parent.partialLengths, parentPartials);
		assert.equal(parent.partialLengths.getPartialLength(2, remoteClientId), 12);

		ancestorPartials.update(ancestor, 2, remoteClientId, mergeTree.collabWindow);
		assert.notEqual(ancestor.partialLengths, ancestorPartials);
		assert.equal(ancestor.partialLengths.getPartialLength(2, remoteClientId), 12);
	});

	describe("a single inserted element", () => {
		it("includes length of local insert for local view", () => {
			mergeTree.insertSegments(
				0,
				[TextSegment.make("more ")],
				mergeTree.localPerspective,
				ackedLocalClientStamp(refSeq + 1),
				{ op: { type: MergeTreeDeltaType.INSERT } },
			);

			validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 17 }]);
		});
		it("includes length of local insert for remote view", () => {
			mergeTree.insertSegments(
				0,
				[TextSegment.make("more ")],
				mergeTree.localPerspective,
				ackedLocalClientStamp(refSeq + 1),
				{ op: { type: MergeTreeDeltaType.INSERT } },
			);

			validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 17 }]);
		});
		it("includes length of remote insert for local view", () => {
			mergeTree.insertSegments(
				0,
				[TextSegment.make("more ")],
				remoteClient1.perspectiveAt({ refSeq }),
				remoteClient1.stampAt({ seq: refSeq + 1 }),
				{ op: { type: MergeTreeDeltaType.INSERT } },
			);

			validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 17 }]);
		});
		it("includes length of remote insert for remote view", () => {
			mergeTree.insertSegments(
				0,
				[TextSegment.make("more ")],
				remoteClient1.perspectiveAt({ refSeq }),
				remoteClient1.stampAt({ seq: refSeq + 1 }),
				{ op: { type: MergeTreeDeltaType.INSERT } },
			);

			validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 17 }]);
		});
	});

	describe("a single removed segment", () => {
		it("includes result of local delete for local view", () => {
			mergeTree.markRangeRemoved(
				0,
				12,
				mergeTree.localPerspective,
				ackedLocalClientStamp(refSeq + 1),
				undefined as never,
			);

			validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 0 }]);
		});
		it("includes result of local delete for remote view", () => {
			mergeTree.markRangeRemoved(
				0,
				12,
				mergeTree.localPerspective,
				ackedLocalClientStamp(refSeq + 1),
				undefined as never,
			);

			validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 0 }]);
		});
		it("includes result of remote delete for local view", () => {
			mergeTree.markRangeRemoved(
				0,
				12,
				remoteClient1.perspectiveAt({ refSeq }),
				ackedLocalClientStamp(refSeq + 1),
				undefined as never,
			);

			validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 0 }]);
		});
		it("includes result of remote delete for remote view", () => {
			mergeTree.markRangeRemoved(
				0,
				12,
				remoteClient1.perspectiveAt({ refSeq }),
				ackedLocalClientStamp(refSeq + 1),
				undefined as never,
			);

			validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 0 }]);
		});
	});

	describe("aggregation", () => {
		it("includes lengths from multiple permutations in single tree", () => {
			mergeTree.insertSegments(
				0,
				[TextSegment.make("1")],
				mergeTree.localPerspective,
				ackedLocalClientStamp(refSeq + 1),
				undefined,
			);
			mergeTree.insertSegments(
				0,
				[TextSegment.make("2")],
				remoteClient1.perspectiveAt({ refSeq: refSeq + 1 }),
				remoteClient1.stampAt({ seq: refSeq + 2 }),
				undefined,
			);
			mergeTree.insertSegments(
				0,
				[TextSegment.make("3")],
				mergeTree.localPerspective,
				ackedLocalClientStamp(refSeq + 3),
				undefined,
			);
			mergeTree.insertSegments(
				0,
				[TextSegment.make("4")],
				remoteClient1.perspectiveAt({ refSeq: refSeq + 3 }),
				remoteClient1.stampAt({ seq: refSeq + 4 }),
				undefined,
			);

			validatePartialLengths(localClientId, mergeTree, [{ seq: 4, len: 16 }]);
			validatePartialLengths(remoteClientId, mergeTree, [{ seq: 4, len: 16 }]);
		});

		it("is correct for different heights", () => {
			for (let i = 0; i < 100; i++) {
				mergeTree.insertSegments(
					0,
					[TextSegment.make("a")],
					mergeTree.localPerspective,
					ackedLocalClientStamp(i + 1),
					undefined,
				);

				validatePartialLengths(localClientId, mergeTree, [{ seq: i + 1, len: i + 13 }]);
				validatePartialLengths(remoteClientId, mergeTree, [{ seq: i + 1, len: i + 13 }]);
			}

			validatePartialLengths(localClientId, mergeTree, [{ seq: 100, len: 112 }]);
			validatePartialLengths(remoteClientId, mergeTree, [{ seq: 100, len: 112 }]);
		});
	});

	describe("concurrent, overlapping deletes", () => {
		it("concurrent remote changes are visible to local", () => {
			const remoteClient2 = makeRemoteClient({ clientId: 19 });

			mergeTree.markRangeRemoved(
				0,
				10,
				remoteClient1.perspectiveAt({ refSeq }),
				remoteClient1.stampAt({ seq: refSeq + 1 }),
				undefined as never,
			);
			mergeTree.markRangeRemoved(
				0,
				10,
				remoteClient2.perspectiveAt({ refSeq }),
				remoteClient2.stampAt({ seq: refSeq + 2 }),
				undefined as never,
			);

			validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 2 }]);
			validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 2 }]);
			validatePartialLengths(remoteClientId + 1, mergeTree, [{ seq: 1, len: 2 }]);
		});
		it("concurrent local and remote changes are visible", () => {
			mergeTree.markRangeRemoved(
				0,
				10,
				mergeTree.localPerspective,
				ackedLocalClientStamp(refSeq + 1),
				undefined as never,
			);
			mergeTree.markRangeRemoved(
				0,
				10,
				remoteClient1.perspectiveAt({ refSeq }),
				remoteClient1.stampAt({ seq: refSeq + 2 }),
				undefined as never,
			);

			validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 2 }]);
			validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 2 }]);
		});
		it("concurrent remote and unsequenced local changes are visible", () => {
			mergeTree.markRangeRemoved(
				0,
				10,
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				undefined as never,
			);
			mergeTree.markRangeRemoved(
				0,
				10,
				remoteClient1.perspectiveAt({ refSeq }),
				remoteClient1.stampAt({ seq: refSeq + 1 }),
				undefined as never,
			);

			validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 2 }]);
			validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 2 }]);
		});
	});
});
