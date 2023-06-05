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
		owner: Flags.string({
			description: "Owner name",
			char: "o",
			required: true,
		}),
		repo: Flags.string({
			description: "Repository name",
			char: "r",
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
		description: Flags.string({
			description: "PR description",
			char: "d",
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

		// `findConflictIndex` return the index of the conflicting commit. If there are no conflicts found, then it would return the last index
		const findConflictIndex = async (commitIds: string[]): Promise<number> => {
			const length = commitIds.length;

			if (length === 0) {
				return -1;
			}

			// Check the first commit separately
			const firstCommit = commitIds[0];
			const firstResponse = await gitRepo.checkMerge(firstCommit);
			this.log(`Response from merge check for ${commitIds[0]}: ${firstResponse}`);
			if (firstResponse === "Abort") {
				return 0;
			}

			// Check the rest of the commitIds
			for (let i = 1; i < length; i++) {
				const commit = commitIds[i];
				// eslint-disable-next-line no-await-in-loop
				const response = await gitRepo.checkMerge(commit);
				this.log(`Response from merge check for ${commitIds[i]}: ${response}`);
				if (response === "Abort") {
					return i;
				}
			}

			return length - 1; // No conflicts found, return the last index
		};

		// `mergeAllCommits` function will merge all commitIds in next branch
		const mergeAllCommits = async (commitIds: string[]): Promise<void> => {
			for (const commit of commitIds) {
				// eslint-disable-next-line no-await-in-loop
				const response = await gitRepo.merge(commit);
				this.log(`Merging commit ${commit}: ${response}`);
			}
		};

		const commitSize = Math.min(flags.batchSize, unmergedCommitList.length);

		await gitRepo.switchBranch(flags.target);
		await gitRepo.createBranch(`${flags.target}-automation`);

		const commitIndex = await findConflictIndex(unmergedCommitList.slice(0, commitSize));

		const branchName = `${flags.source}-${flags.target}-${unmergedCommitList[commitIndex]}`;

		if (commitIndex === 0) {
			// implies commit id `unmergedCommitList[commitIndex]` has merge commits with next branch. do not merge next
			this.log(
				`Commit ${unmergedCommitList[commitIndex]} has merge conflicts with ${flags.target}`,
			);
			await gitRepo.switchBranch(flags.source);
			await gitRepo.createBranch(branchName);
			await gitRepo.setUpstream(branchName);
			await gitRepo.resetBranch(unmergedCommitList[commitIndex]);
		} else {
			// implies commitIndex has no conflicts with next. Merge next
			this.log(
				`Commits till ${unmergedCommitList[commitIndex]} has no merge conflicts with ${flags.target}`,
			);
			await gitRepo.switchBranch(flags.target);
			await gitRepo.createBranch(branchName);
			await gitRepo.setUpstream(branchName);
			// merge all commits in next branch
			await mergeAllCommits(unmergedCommitList.slice(0, commitIndex));
		}

		// fetch name of owner associated to the pull request
		const pr = await pullRequestInfo(flags.auth, unmergedCommitList[commitIndex], this.logger);
		this.info(
			`Fetch pull request info for commit id ${commitIndex} and assignee ${pr.data[0].assignee.login}`,
		);
		const user = await getUserAccess(flags.auth, this.logger);
		this.info(`List users with push access to main branch ${user}`);

		const prNumber = await createPullRequest(
			flags.auth,
			branchName,
			flags.target,
			pr.data[0].assignee.login,
			this.logger,
		);
		this.log(
			`Open pull request ${prNumber} for commit id ${commitIndex}. Please resolve the merge conflicts.`,
		);
	}
}
