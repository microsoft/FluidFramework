/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";

import { BaseCommand } from "../../base";
import { createPullRequest, getUserAccess, pullRequestExists, pullRequestInfo } from "../../lib";

/**
 * This command class is used to merge two branches based on the batch size provided.
 * It looks for the last common commit between two branches and computes the remaining commits to be merged.
 * Later, it creates a pull request based on the batch size passed.
 */
export default class MergeBranch extends BaseCommand<typeof MergeBranch> {
	static description = "Sync branches depending on the batch size passed";

	static flags = {
		auth: Flags.string({
			description: "GitHub authentication token",
			char: "a",
			required: true,
		}),
		source: Flags.string({
			description: "Source branch name",
			char: "s",
			required: true,
		}),
		target: Flags.string({
			description: "Target branch name",
			char: "t",
			required: true,
		}),
		batchSize: Flags.integer({
			description: "Maximum number of commits to include in the pull request",
			char: "b",
			required: true,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const flags = this.flags;

		const context = await this.getContext();
		const gitRepo = context.gitRepo;
		const prExists: boolean = await pullRequestExists(flags.auth, this.logger);

		if (prExists) {
			this.exit(-1);
			this.error(`Open pull request exists`);
			// TODO: notify the author
		}

		const lastMergedCommit = await gitRepo.mergeBase(flags.source, flags.target);
		this.log(
			`${lastMergedCommit} is the last merged commit id between ${flags.source} and ${flags.target}`,
		);

		const unmergedCommitList: string[] = [];
		const revListOutput = await gitRepo.revList(lastMergedCommit, flags.source);
		const commitLines = revListOutput.split("\n");

		for (const line of commitLines) {
			const id = line.trim();
			unmergedCommitList.push(id);
		}

		this.log(
			`There are ${unmergedCommitList.length} unmerged commits between ${flags.source} and ${flags.target} branches`,
		);

		if (unmergedCommitList.length === 0) {
			this.log(
				`${flags.source} and ${flags.target} branches are in sync. No commits to merge`,
			);
			this.exit(-1);
		}

		const findConflictCommit = async (commitIds: string[], size: number): Promise<string> => {
			for (let i = 0; i < size; i++) {
				const commit = commitIds[i];
				// eslint-disable-next-line no-await-in-loop
				const response = await gitRepo.merge(commit);

				if (response === "Abort merge") {
					return commit;
				}
			}

			return commitIds[size - 1];
		};

		const commitSize =
			flags.batchSize <= unmergedCommitList.length
				? flags.batchSize
				: unmergedCommitList.length;

		const commitId = await findConflictCommit(unmergedCommitList, commitSize);

		const branchName = `${flags.source}-${flags.target}-${commitId}`;

		await gitRepo.switchBranch(flags.source);
		await gitRepo.createBranch(branchName);
		await gitRepo.setUpstream(branchName);
		await gitRepo.resetBranch(commitId);

		// fetch name of owner associated to the pull request
		const prInfo = await pullRequestInfo(flags.auth, unmergedCommitList[0], this.logger);
		this.info(
			`Fetch pull request info for single commit id ${unmergedCommitList[0]} and assignee ${prInfo.data[0].assignee.login}`,
		);
		const user = await getUserAccess(flags.auth, this.logger);
		this.info(`List users with push access to main branch ${user}`);
		const prNumber = await createPullRequest(
			flags.auth,
			branchName,
			flags.target,
			prInfo.data[0].assignee.login,
			this.logger,
		);
		this.log(
			`Open pull request ${prNumber} for commit id ${commitId}. Please resolve the merge conflicts.`,
		);
	}
}
