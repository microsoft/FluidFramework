/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";

import { BaseCommand } from "../../base";
import { createPullRequest, getUserAccess, pullRequestExists, pullRequestInfo } from "../../lib";
import { GitRepo } from "@fluidframework/build-tools";

interface CommitStatus {
	index: number;
	isConflict: boolean;
}

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

	/**
	 * `findConflictIndex` return an object `CommitStatus` which return the index and isConflict property which is set
	 * to true if there is a conflict else false.
	 */
	async findConflictIndex(commitIds: string[], gitRepo: GitRepo): Promise<CommitStatus> {
		const length = commitIds.length;

		// Check the first commit separately
		const firstCommit = commitIds[0];
		const firstResponse = await gitRepo.canMergeWithoutConflicts(firstCommit);
		this.log(`Response from merge check for ${commitIds[0]}: ${firstResponse}`);
		if (firstResponse === false) {
			return { index: 0, isConflict: true };
		}

		// Check the rest of the commitIds
		for (let i = 1; i < length; i++) {
			const commit = commitIds[i];
			// eslint-disable-next-line no-await-in-loop
			const response = await gitRepo.canMergeWithoutConflicts(commit);
			this.log(`Response from merge check for ${commitIds[i]}: ${response}`);
			if (response === false) {
				return { index: i - 1, isConflict: false };
			}
		}

		return { index: length - 1, isConflict: false }; // No conflicts found, return the last index
	}

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

		const commitSize = Math.min(flags.batchSize, unmergedCommitList.length);

		await gitRepo.switchBranch(flags.target);
		await gitRepo.createBranch(`${flags.target}-automation`);
		await gitRepo.setUpstream(`${flags.target}-automation`);

		const commitInfo = await this.findConflictIndex(
			unmergedCommitList.slice(0, commitSize),
			gitRepo,
		);

		const commitId = unmergedCommitList[commitInfo.index];

		const branchName = `${flags.source}-${flags.target}-${commitId}`;

		await gitRepo.deleteBranch(`${flags.target}-automation`);
		await gitRepo.switchBranch(flags.source);
		await gitRepo.createBranch(branchName);
		await gitRepo.setUpstream(branchName);
		await gitRepo.resetBranch(commitId);

		if (commitInfo.isConflict === false) {
			await gitRepo.mergeBranch(
				flags.target,
				`Automation: ${flags.source} ${flags.target} integrate`,
			);
		}

		// fetch name of owner associated to the pull request
		const pr = await pullRequestInfo(flags.auth, commitId, this.logger);
		const author = pr.data[0].assignee.login;
		this.info(`Fetch pull request info for commit id ${commitInfo} and assignee ${author}`);
		const user = await getUserAccess(flags.auth, this.logger);
		this.info(`List users with push access to main branch ${user}`);

		const prNumber = await createPullRequest(
			flags.auth,
			branchName,
			flags.target,
			author,
			this.logger,
		);
		this.log(
			`Opened pull request ${prNumber} for commit id ${commitId}. Please resolve the merge conflicts.`,
		);
	}
}
