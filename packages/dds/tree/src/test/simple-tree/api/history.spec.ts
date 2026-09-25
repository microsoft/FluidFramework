/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { Listenable } from "@fluidframework/core-interfaces";
import { FluidClientVersion, FormatValidatorNoOp } from "../../../codec/index.js";
import { rootFieldKey } from "../../../core/index.js";
import { fieldBatchCodecBuilder } from "../../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { DefaultTreeBranchHistory } from "../../../shared-tree/history.js";
// eslint-disable-next-line import-x/no-internal-modules
import { SharedTreeChangeFamily } from "../../../shared-tree/sharedTreeChangeFamily.js";
import {
	SharedTreeBranch,
	type BranchTrimmingEvents,
} from "../../../shared-tree-core/index.js";
import { brand } from "../../../util/index.js";
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

type BranchType = SharedTreeBranch<
	ReturnType<SharedTreeChangeFamily["buildEditor"]>,
	ReturnType<SharedTreeChangeFamily["compose"]>,
	unknown
>;

function createBranch(): BranchType;
function createBranch(branchTrimmer: Listenable<BranchTrimmingEvents>): BranchType;
function createBranch(branchTrimmer?: Listenable<BranchTrimmingEvents>): BranchType {
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
			customMetadata: undefined,
			wasTrimmed: true,
		},
		changeFamily,
		mintRevisionTag,
		branchTrimmer,
	);
}

function setRootValue(branch: BranchType, value: number): void {
	const content = chunkFromJsonableTrees([{ type: brand("TestValue"), value }]);
	branch.editor.valueField({ parent: undefined, field: rootFieldKey }).set(content);
}

describe("TreeBranchHistoryImpl", () => {
	it("commitCount reflects the number of commits in the branch", () => {
		const branch = createBranch();
		const history = new DefaultTreeBranchHistory(branch, testIdCompressor);
		assert.equal(history.length, 0);

		setRootValue(branch, 3);
		setRootValue(branch, 4);
		assert.equal(history.length, 2);

		history.dispose();
	});

	describe("getHeadCommit", () => {
		it("returns metadata for the current head commit", () => {
			const branch = createBranch();
			const history = new DefaultTreeBranchHistory(branch, testIdCompressor);

			const beforeInit = history.getHead();
			assert.equal(beforeInit, undefined);

			setRootValue(branch, 3);

			const afterInit = history.getHead();
			assert.notEqual(afterInit, undefined);

			setRootValue(branch, 4);

			const afterEdit = history.getHead();
			assert.notEqual(afterEdit, undefined);
			assert.notEqual(afterEdit?.revision, afterInit?.revision);
			history.dispose();
		});

		it("reflects independent heads on forked branches", () => {
			const branchA = createBranch();
			setRootValue(branchA, 3);
			const branchB = branchA.fork();

			const historyA = new DefaultTreeBranchHistory(branchA, testIdCompressor);
			const historyB = new DefaultTreeBranchHistory(branchB, testIdCompressor);

			const headA = historyA.getHead();
			const headB = historyB.getHead();
			assert(headA !== undefined);
			assert(headB !== undefined);
			assert.equal(headA.revision, headB.revision);

			setRootValue(branchA, 4);
			const nextHeadA = historyA.getHead();
			const nextHeadB = historyB.getHead();
			assert(nextHeadA !== undefined);
			assert(nextHeadB !== undefined);
			assert.notEqual(nextHeadA.revision, nextHeadB.revision);
			historyA.dispose();
			historyB.dispose();
		});

		it("exposes ancestor commits via the parent field", () => {
			const branch = createBranch();
			const history = new DefaultTreeBranchHistory(branch, testIdCompressor);
			setRootValue(branch, 3);
			const afterInit = history.getHead();
			assert(afterInit !== undefined);

			setRootValue(branch, 4);
			setRootValue(branch, 5);

			const head = history.getHead();
			assert(head !== undefined);
			assert.notEqual(head.revision, afterInit.revision);

			const parent = head.getParent();
			assert(parent !== undefined);
			assert.notEqual(parent.revision, head.revision);

			const grandparent = parent.getParent();
			assert(grandparent !== undefined);
			assert.equal(grandparent.revision, afterInit.revision);

			// The oldest commit's parent is the root commit, which has no metadata.
			assert.equal(grandparent.getParent(), undefined);
			history.dispose();
		});
	});
});
