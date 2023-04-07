/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SharedTreeBranch } from "../../shared-tree-core";
import {
	AnchorSet,
	GraphCommit,
	Rebaser,
	RevisionTag,
	assertIsRevisionTag,
	findAncestor,
} from "../../core";
import { DefaultChangeFamily, DefaultChangeset, DefaultEditBuilder } from "../../feature-libraries";

describe("Branches", () => {
	const nullRevisionTag = assertIsRevisionTag("00000000-0000-4000-8000-000000000000");

	it("generate consistent commits as they change", () => {
		const branch = createOrFork();
		const rootCommit = branch.getHead();
		const tag1 = change(branch);
		const tag2 = change(branch);
		const commits: GraphCommit<DefaultChangeset>[] = [];
		const ancestor = findAncestor(
			[branch.getHead(), commits],
			(c) => c.revision === nullRevisionTag,
		);
		assert.equal(ancestor, rootCommit);
		assert.deepEqual(
			commits.map((c) => c.revision),
			[tag1, tag2],
		);
	});

	it("fork", () => {
		const branch = createOrFork();
		const rootCommit = branch.getHead();
		const tag1 = change(branch);
		const tag2 = change(branch);
		const commits: GraphCommit<DefaultChangeset>[] = [];
		const ancestor = findAncestor(
			[branch.getHead(), commits],
			(c) => c.revision === nullRevisionTag,
		);
		assert.equal(ancestor, rootCommit);
		assert.deepEqual(
			commits.map((c) => c.revision),
			[tag1, tag2],
		);
	});

	/** Forks from the given branch, or creates a new root branch if no base is provided */
	function createOrFork(
		base?: SharedTreeBranch<DefaultEditBuilder, DefaultChangeset>,
	): SharedTreeBranch<DefaultEditBuilder, DefaultChangeset> {
		if (base !== undefined) {
			return base.fork(new AnchorSet());
		}
		const changeFamily = new DefaultChangeFamily();
		const initCommit: GraphCommit<DefaultChangeset> = {
			change: changeFamily.rebaser.compose([]),
			revision: nullRevisionTag,
			sessionId: "testSession",
		};
		return new SharedTreeBranch(
			() => initCommit,
			() => changeFamily.rebaser.compose([]),
			"testSession",
			new Rebaser(changeFamily.rebaser),
			changeFamily,
			new AnchorSet(),
		);
	}

	function change(branch: SharedTreeBranch<any, any>): RevisionTag {
		branch.applyChange(branch.changeFamily.rebaser.compose([]));
		return branch.getHead().revision;
	}
});
