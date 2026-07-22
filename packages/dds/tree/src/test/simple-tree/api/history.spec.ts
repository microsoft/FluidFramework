/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createEmitter } from "@fluid-internal/client-utils";
import type { Listenable } from "@fluidframework/core-interfaces";
import { FluidClientVersion, FormatValidatorNoOp } from "../../../codec/index.js";
import { rootFieldKey } from "../../../core/index.js";
import { fieldBatchCodecBuilder } from "../../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { TreeBranchHistoryImpl } from "../../../shared-tree/history.js";
// eslint-disable-next-line import-x/no-internal-modules
import { SharedTreeChangeFamily } from "../../../shared-tree/sharedTreeChangeFamily.js";
import { SharedTreeBranch } from "../../../shared-tree-core/index.js";
import { brand } from "../../../util/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { BranchTrimmingEvents } from "../../../shared-tree-core/branch.js";
import {
	chunkFromJsonableTrees,
	mintRevisionTag,
	testIdCompressor,
	testRevisionTagCodec,
} from "../../utils.js";

const codecOptions = {
	jsonValidator: FormatValidatorNoOp,
	minVersionForCollab: FluidClientVersion.v2_0,
};

function createBranch(): SharedTreeBranch<
	ReturnType<SharedTreeChangeFamily["buildEditor"]>,
	ReturnType<SharedTreeChangeFamily["compose"]>
>;
function createBranch(
	branchTrimmer: Listenable<BranchTrimmingEvents>,
): SharedTreeBranch<
	ReturnType<SharedTreeChangeFamily["buildEditor"]>,
	ReturnType<SharedTreeChangeFamily["compose"]>
>;
function createBranch(
	branchTrimmer?: Listenable<BranchTrimmingEvents>,
): SharedTreeBranch<
	ReturnType<SharedTreeChangeFamily["buildEditor"]>,
	ReturnType<SharedTreeChangeFamily["compose"]>
> {
	const changeFamily = new SharedTreeChangeFamily(
		testRevisionTagCodec,
		fieldBatchCodecBuilder.build(codecOptions),
		codecOptions,
		undefined,
		testIdCompressor,
	);

	return new SharedTreeBranch(
		{
			change: changeFamily.rebaser.compose([]),
			revision: "root",
		},
		changeFamily,
		mintRevisionTag,
		branchTrimmer,
	);
}

function setRootValue(
	branch: SharedTreeBranch<
		ReturnType<SharedTreeChangeFamily["buildEditor"]>,
		ReturnType<SharedTreeChangeFamily["compose"]>
	>,
	value: number,
): void {
	const content = chunkFromJsonableTrees([{ type: brand("TestValue"), value }]);
	branch.editor.valueField({ parent: undefined, field: rootFieldKey }).set(content);
}

describe("TreeBranchHistoryImpl", () => {
	describe("commitCount", () => {
		it("size reflects the number of commits in the branch", () => {
			const branch = createBranch();
			const history = new TreeBranchHistoryImpl(branch, testIdCompressor);
			setRootValue(branch, 3);
			const sizeAfterInit = history.commitCount;
			assert(sizeAfterInit > 0);

			setRootValue(branch, 4);
			assert.equal(history.commitCount, sizeAfterInit + 1);

			setRootValue(branch, 5);
			assert.equal(history.commitCount, sizeAfterInit + 2);
			history.dispose();
		});

		it("increases independently on forked branches", () => {
			const branchA = createBranch();
			setRootValue(branchA, 3);
			const branchB = branchA.fork();

			const historyA = new TreeBranchHistoryImpl(branchA, testIdCompressor);
			const historyB = new TreeBranchHistoryImpl(branchB, testIdCompressor);

			const initialSize = historyA.commitCount;
			assert.equal(historyB.commitCount, initialSize);

			setRootValue(branchA, 4);
			assert.equal(historyA.commitCount, initialSize + 1);
			assert.equal(historyB.commitCount, initialSize);

			setRootValue(branchB, 5);
			assert.equal(historyA.commitCount, initialSize + 1);
			assert.equal(historyB.commitCount, initialSize + 1);
			historyA.dispose();
			historyB.dispose();
		});

		it("updates when branch ancestry is trimmed", () => {
			const branchTrimmer = createEmitter<BranchTrimmingEvents>();
			const branch = createBranch(branchTrimmer);
			const history = new TreeBranchHistoryImpl(branch, testIdCompressor);

			setRootValue(branch, 3);
			const commit1 = branch.getHead().revision;
			setRootValue(branch, 4);
			const commit2 = branch.getHead().revision;
			setRootValue(branch, 5);

			assert.equal(history.commitCount, 3);

			branchTrimmer.emit("ancestryTrimmed", [commit1, commit2]);

			assert.equal(history.commitCount, 1);
			history.dispose();
		});

		it("updates when another branch is merged into the tracked branch", () => {
			const trackedBranch = createBranch();
			setRootValue(trackedBranch, 1);
			const sourceBranch = trackedBranch.fork();

			const history = new TreeBranchHistoryImpl(trackedBranch, testIdCompressor);
			assert.equal(history.commitCount, 1);

			setRootValue(sourceBranch, 2);
			setRootValue(sourceBranch, 3);

			trackedBranch.merge(sourceBranch);

			assert.equal(history.commitCount, 3);
			history.dispose();
		});

		it("updates when the tracked branch is rebased over another branch", () => {
			const baseBranch = createBranch();
			setRootValue(baseBranch, 1);

			const trackedBranch = baseBranch.fork();
			const sourceBranch = baseBranch.fork();
			const history = new TreeBranchHistoryImpl(trackedBranch, testIdCompressor);

			setRootValue(trackedBranch, 2);
			setRootValue(sourceBranch, 3);
			setRootValue(sourceBranch, 4);

			assert.equal(history.commitCount, 2);

			trackedBranch.rebaseOnto(sourceBranch);

			assert.equal(history.commitCount, 4);
			history.dispose();
		});
	});

	describe("getHeadCommit", () => {
		it("returns metadata for the current head commit", () => {
			const branch = createBranch();
			const history = new TreeBranchHistoryImpl(branch, testIdCompressor);

			const beforeInit = history.getHeadCommit();
			assert.equal(beforeInit, undefined);

			setRootValue(branch, 3);

			const afterInit = history.getHeadCommit();
			assert.notEqual(afterInit, undefined);

			setRootValue(branch, 4);

			const afterEdit = history.getHeadCommit();
			assert.notEqual(afterEdit, undefined);
			assert.notEqual(afterEdit?.revision, afterInit?.revision);
			history.dispose();
		});

		it("reflects independent heads on forked branches", () => {
			const branchA = createBranch();
			setRootValue(branchA, 3);
			const branchB = branchA.fork();

			const historyA = new TreeBranchHistoryImpl(branchA, testIdCompressor);
			const historyB = new TreeBranchHistoryImpl(branchB, testIdCompressor);

			const headA = historyA.getHeadCommit();
			const headB = historyB.getHeadCommit();
			assert(headA !== undefined);
			assert(headB !== undefined);
			assert.equal(headA.revision, headB.revision);

			setRootValue(branchA, 4);
			const nextHeadA = historyA.getHeadCommit();
			const nextHeadB = historyB.getHeadCommit();
			assert(nextHeadA !== undefined);
			assert(nextHeadB !== undefined);
			assert.notEqual(nextHeadA.revision, nextHeadB.revision);
			historyA.dispose();
			historyB.dispose();
		});

		it("exposes ancestor commits via the parent field", () => {
			const branch = createBranch();
			const history = new TreeBranchHistoryImpl(branch, testIdCompressor);
			setRootValue(branch, 3);
			const afterInit = history.getHeadCommit();
			assert(afterInit !== undefined);

			setRootValue(branch, 4);
			setRootValue(branch, 5);

			const head = history.getHeadCommit();
			assert(head !== undefined);
			assert.notEqual(head.revision, afterInit.revision);

			const parent = head.parent;
			assert(parent !== undefined);
			assert.notEqual(parent.revision, head.revision);

			const grandparent = parent.parent;
			assert(grandparent !== undefined);
			assert.equal(grandparent.revision, afterInit.revision);

			// The oldest commit's parent is the root commit, which has no metadata.
			assert.equal(grandparent.parent, undefined);
			history.dispose();
		});
	});
});
