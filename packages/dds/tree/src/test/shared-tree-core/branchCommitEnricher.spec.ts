/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { TestChange, TestChangeRebaser } from "../testChange.js";
import { CommitKind, type GraphCommit } from "../../core/index.js";
import { mintRevisionTag } from "../utils.js";
import { TestChangeEnricher } from "./utils.js";
// eslint-disable-next-line import/no-internal-modules
import { BranchCommitEnricher } from "../../shared-tree-core/branchCommitEnricher.js";

const rebaser = new TestChangeRebaser();
const enricher = new TestChangeEnricher();
const change = { change: TestChange.emptyChange, revision: undefined };

function mintCommit(): GraphCommit<TestChange> {
	const tag = mintRevisionTag();
	const commit: GraphCommit<TestChange> = {
		change: TestChange.mint([], tag as number),
		revision: tag,
	};
	return commit;
}

const actions = [
	{
		description: "noop",
		action: (commitEnricher: BranchCommitEnricher<TestChange>) => {},
	},
	{
		description: "commit empty transaction",
		action: (commitEnricher: BranchCommitEnricher<TestChange>) => {
			commitEnricher.startTransaction();
			commitEnricher.commitTransaction();
		},
	},
	{
		description: "abort empty transaction",
		action: (commitEnricher: BranchCommitEnricher<TestChange>) => {
			commitEnricher.startTransaction();
			commitEnricher.abortTransaction();
		},
	},
	{
		description: "process 1 change (no enrich call)",
		action: (commitEnricher: BranchCommitEnricher<TestChange>) => {
			const commit = mintCommit();
			commitEnricher.processChange({
				type: "append",
				change,
				kind: CommitKind.Default,
				newCommits: [commit],
			});
		},
	},
	{
		description: "process 1 change (with enrich call)",
		action: (commitEnricher: BranchCommitEnricher<TestChange>) => {
			const commit = mintCommit();
			commitEnricher.processChange({
				type: "append",
				change,
				kind: CommitKind.Default,
				newCommits: [commit],
			});
			const actual = commitEnricher.enrich(commit);
			const expected = {
				change: enricher.updateChangeEnrichments(commit.change, commit.revision),
				revision: commit.revision,
			};
			assert.deepEqual(actual, expected);
		},
	},
	{
		description: "process transaction (no enrich call)",
		action: (commitEnricher: BranchCommitEnricher<TestChange>) => {
			const innerCommit = mintCommit();
			const outerCommit = mintCommit();
			commitEnricher.startTransaction();
			commitEnricher.addTransactionCommits([innerCommit]);
			commitEnricher.commitTransaction();
			commitEnricher.processChange({
				type: "append",
				change,
				kind: CommitKind.Default,
				newCommits: [outerCommit],
			});
		},
	},
	{
		description: "process transaction (with enrich call)",
		action: (commitEnricher: BranchCommitEnricher<TestChange>) => {
			const innerCommit = mintCommit();
			const outerCommit = mintCommit();
			commitEnricher.startTransaction();
			commitEnricher.addTransactionCommits([innerCommit]);
			commitEnricher.commitTransaction();
			commitEnricher.processChange({
				type: "append",
				change,
				kind: CommitKind.Default,
				newCommits: [outerCommit],
			});
			const actual = commitEnricher.enrich(outerCommit);
			const expected = {
				change: enricher.updateChangeEnrichments(innerCommit.change, innerCommit.revision),
				revision: outerCommit.revision,
			};
			assert.deepEqual(actual, expected);
		},
	},
	{
		description: "abort transaction",
		action: (commitEnricher: BranchCommitEnricher<TestChange>) => {
			const commit = mintCommit();
			commitEnricher.startTransaction();
			commitEnricher.addTransactionCommits([commit]);
			commitEnricher.abortTransaction();
		},
	},
];

describe("BranchCommitEnricher", () => {
	for (const { description: d1, action: a1 } of actions) {
		describe(d1, () => {
			for (const { description: d2, action: a2 } of actions) {
				describe(d2, () => {
					for (const { description: d3, action: a3 } of actions) {
						it(d3, () => {
							const commitEnricher = new BranchCommitEnricher<TestChange>(rebaser, enricher);
							a1(commitEnricher);
							a2(commitEnricher);
							a3(commitEnricher);
						});
					}
				});
			}
		});
	}
});
