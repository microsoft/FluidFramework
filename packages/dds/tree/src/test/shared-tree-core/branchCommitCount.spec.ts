/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createEmitter } from "@fluid-internal/client-utils";
import { FluidClientVersion } from "../../codec/index.js";
import { CommitKind, type GraphCommit } from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import {
	DefaultChangeFamily,
	type DefaultChangeProcessingContext,
	type DefaultChangeset,
	type DefaultEditBuilder,
} from "../../feature-libraries/index.js";
import {
	SharedTreeBranch,
	type BranchTrimState,
	type BranchTrimmingEvents,
} from "../../shared-tree-core/index.js";
import type { Mutable } from "../../util/index.js";
import { failCodecFamily, mintRevisionTag } from "../utils.js";

const defaultChangeFamily = new DefaultChangeFamily(failCodecFamily, {
	jsonValidator: FormatValidatorBasic,
	minVersionForCollab: FluidClientVersion.v2_0,
});

type DefaultBranch = SharedTreeBranch<
	DefaultEditBuilder,
	DefaultChangeset,
	DefaultChangeProcessingContext
>;

function createBranch(trimState?: BranchTrimState): DefaultBranch {
	return new SharedTreeBranch(
		{
			change: defaultChangeFamily.rebaser.compose([]),
			revision: "root",
			customMetadata: undefined,
		},
		defaultChangeFamily,
		mintRevisionTag,
		trimState ?? { trimmedCommitCount: 0 },
	);
}

function edit(branch: DefaultBranch): void {
	branch.apply(
		{
			change: defaultChangeFamily.rebaser.compose([]),
			revision: mintRevisionTag(),
		},
		CommitKind.Default,
		undefined,
	);
}

describe("Branch commit counts", () => {
	it("counts older forks without copying the current head's count", () => {
		const branch = createBranch();
		edit(branch);
		const olderHead = branch.getHead();
		edit(branch);
		assert.equal(branch.getCommitCount(), 2);

		const fork = branch.fork(olderHead);
		assert.equal(fork.getCommitCount(), 1);
		edit(fork);
		assert.equal(fork.getCommitCount(), 2);
	});

	it("shares trim accounting across cached, unread, and newly created forks", () => {
		const trimState = { trimmedCommitCount: 0 };
		const branch = createBranch(trimState);
		edit(branch);
		edit(branch);
		const newBase = branch.getHead() as Mutable<GraphCommit<DefaultChangeset>>;
		edit(branch);
		const cachedFork = branch.fork();
		const unreadFork = branch.fork();
		assert.equal(branch.getCommitCount(), 3);
		assert.equal(cachedFork.getCommitCount(), 3);

		delete newBase.parent;
		trimState.trimmedCommitCount += 2;

		assert.equal(branch.getCommitCount(), 1);
		assert.equal(cachedFork.getCommitCount(), 1);
		assert.equal(unreadFork.getCommitCount(), 1);
		const newFork = cachedFork.fork();
		assert.equal(newFork.getCommitCount(), 1);
		const oldFork = branch.fork(newBase);
		assert.equal(oldFork.getCommitCount(), 0);
		oldFork.dispose();

		edit(newFork);
		assert.equal(newFork.getCommitCount(), 2);
		const nextBase = branch.getHead() as Mutable<GraphCommit<DefaultChangeset>>;
		delete nextBase.parent;
		trimState.trimmedCommitCount++;
		assert.equal(branch.getCommitCount(), 0);
		assert.equal(cachedFork.getCommitCount(), 0);
		assert.equal(unreadFork.getCommitCount(), 0);
		assert.equal(newFork.getCommitCount(), 1);
	});

	it("counts branches created after earlier trims", () => {
		const trimState = { trimmedCommitCount: 10 };
		const branch = createBranch(trimState);
		edit(branch);
		edit(branch);
		const newBase = branch.getHead() as Mutable<GraphCommit<DefaultChangeset>>;
		edit(branch);
		assert.equal(branch.getCommitCount(), 3);

		delete newBase.parent;
		trimState.trimmedCommitCount += 2;
		assert.equal(branch.getCommitCount(), 1);
	});

	it("freezes a disposed branch's count while live branches keep tracking trims", () => {
		const trimState = { trimmedCommitCount: 0 };
		const branch = createBranch(trimState);
		edit(branch);
		edit(branch);
		const newBase = branch.getHead() as Mutable<GraphCommit<DefaultChangeset>>;
		edit(branch);
		assert.equal(branch.getCommitCount(), 3);
		const fork = branch.fork();
		assert.equal(fork.getCommitCount(), 3);
		fork.dispose();

		delete newBase.parent;
		trimState.trimmedCommitCount += 2;
		assert.equal(branch.getCommitCount(), 1);
		assert.equal(fork.getCommitCount(), 3);
		fork.dispose();
		assert.equal(fork.getCommitCount(), 3);
	});

	it("matches the branch state inside change callbacks", () => {
		const branch = createBranch();
		assert.equal(branch.getCommitCount(), 0);
		branch.events.on("beforeChange", () => assert.equal(branch.getCommitCount(), 0));
		branch.events.on("afterChange", () => assert.equal(branch.getCommitCount(), 1));

		edit(branch);
		assert.equal(branch.getCommitCount(), 1);
	});

	it("updates before a change listener throws", () => {
		const branch = createBranch();
		branch.events.on("afterChange", () => {
			throw new Error("Listener failed");
		});
		assert.equal(branch.getCommitCount(), 0);

		assert.throws(() => edit(branch), /Listener failed/);
		assert.equal(branch.getCommitCount(), 1);
	});

	it("does not walk cached ancestry after edits, forks, or known head replacements", () => {
		const branch = createBranch();
		let parentReads = 0;
		Object.defineProperty(branch.getHead(), "parent", {
			get: () => {
				parentReads++;
				return undefined;
			},
		});
		edit(branch);
		assert.equal(branch.getCommitCount(), 1);
		const initialReads = parentReads;
		assert(initialReads > 0);

		edit(branch);
		assert.equal(branch.getCommitCount(), 2);
		const fork = branch.fork();
		assert.equal(fork.getCommitCount(), 2);
		edit(fork);
		branch.setHead(fork.getHead(), 1);
		assert.equal(branch.getCommitCount(), 3);
		branch.trimmer = createEmitter<BranchTrimmingEvents>();
		assert.equal(branch.getCommitCount(), 3);
		branch.trimmer = createEmitter<BranchTrimmingEvents>();
		assert.equal(branch.getCommitCount(), 3);
		branch.trimmer = undefined;
		assert.equal(branch.getCommitCount(), 3);
		assert.equal(parentReads, initialReads);
	});
});
