/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	BranchCommitCounter,
	type BranchTrimmingEvents,
	SharedTreeBranch,
} from "../../shared-tree-core/index.js";
import type { GraphCommit, RevisionTag } from "../../core/index.js";
import {
	DefaultChangeFamily,
	type DefaultChangeProcessingContext,
	type DefaultChangeset,
	type DefaultEditBuilder,
} from "../../feature-libraries/index.js";
import { failCodecFamily, mintRevisionTag } from "../utils.js";
import { createEmitter } from "@fluid-internal/client-utils";
import { FluidClientVersion } from "../../codec/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";

export const defaultChangeFamily = new DefaultChangeFamily(failCodecFamily, {
	jsonValidator: FormatValidatorBasic,
	minVersionForCollab: FluidClientVersion.v2_0,
});

export type DefaultBranch = SharedTreeBranch<
	DefaultEditBuilder,
	DefaultChangeset,
	DefaultChangeProcessingContext
>;

function mintCommit(revision?: RevisionTag): GraphCommit<DefaultChangeset> {
	return {
		change: defaultChangeFamily.rebaser.compose([]),
		revision: revision ?? mintRevisionTag(),
		persistedMetadata: undefined,
	};
}

function createBranch(
	branchTrimmer?: ReturnType<typeof createEmitter<BranchTrimmingEvents>>,
): DefaultBranch {
	return new SharedTreeBranch(
		mintCommit("root"),
		defaultChangeFamily,
		mintRevisionTag,
		branchTrimmer,
	);
}

function edit(branch: DefaultBranch): void {
	branch.apply(mintCommit());
}

describe("BranchCommitCounter", () => {
	it("reflects the number of commits in the branch as new commits are applied", () => {
		const branch = createBranch();
		// Starting with an empty branch
		const counter1 = new BranchCommitCounter(branch);
		assert.equal(counter1.count, 0);

		edit(branch);
		assert.equal(counter1.count, 1);

		edit(branch);

		// Starting with a branch that already has commits
		const counter2 = new BranchCommitCounter(branch);
		assert.equal(counter1.count, 2);
		assert.equal(counter2.count, 2);

		edit(branch);
		assert.equal(counter1.count, 3);
		assert.equal(counter2.count, 3);
		counter1.dispose();
		counter2.dispose();
	});

	it("increases independently on forked branches", () => {
		const branchA = createBranch();
		const branchB = branchA.fork();

		const counterA = new BranchCommitCounter(branchA);
		const counterB = new BranchCommitCounter(branchB);

		edit(branchA);
		assert.equal(counterA.count, 1);
		assert.equal(counterB.count, 0);

		edit(branchB);
		assert.equal(counterA.count, 1);
		assert.equal(counterB.count, 1);
		counterA.dispose();
		counterB.dispose();
	});

	it("updates when branch ancestry is trimmed", () => {
		const branchTrimmer = createEmitter<BranchTrimmingEvents>();
		const branch = createBranch(branchTrimmer);
		const counter = new BranchCommitCounter(branch);

		edit(branch);
		const commit1 = branch.getHead().revision;
		edit(branch);
		const commit2 = branch.getHead().revision;
		edit(branch);

		assert.equal(counter.count, 3);

		branchTrimmer.emit("ancestryTrimmed", [commit1, commit2]);

		assert.equal(counter.count, 1);
		counter.dispose();
	});

	it("updates when another branch is merged into the tracked branch", () => {
		const trackedBranch = createBranch();
		edit(trackedBranch);
		const sourceBranch = trackedBranch.fork();

		const counter = new BranchCommitCounter(trackedBranch);
		assert.equal(counter.count, 1);

		edit(sourceBranch);
		edit(sourceBranch);

		trackedBranch.merge(sourceBranch);

		assert.equal(counter.count, 3);
		counter.dispose();
	});

	it("updates when the tracked branch is rebased over another branch", () => {
		const baseBranch = createBranch();
		edit(baseBranch);

		const trackedBranch = baseBranch.fork();
		const sourceBranch = baseBranch.fork();
		const counter = new BranchCommitCounter(trackedBranch);

		edit(trackedBranch);
		edit(sourceBranch);
		edit(sourceBranch);

		assert.equal(counter.count, 2);

		trackedBranch.rebaseOnto(sourceBranch);

		assert.equal(counter.count, 4);
		counter.dispose();
	});
});
