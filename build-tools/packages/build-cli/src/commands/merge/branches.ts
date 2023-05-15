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
		pullRequestInfo: Flags.string({
			description: "Pull request data",
			char: "p",
			multiple: true,
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
		}

		const lastMergedCommit = await gitRepo.mergeBase(flags.source, flags.target);
		this.log(
			`${lastMergedCommit} is the last merged commit id between ${flags.source} and ${flags.target}`,
		);

		const listCommits = await gitRepo.revList(lastMergedCommit, flags.source);
		const unmergedCommitList: string[] = [];
		let str = "";

		for (const id of listCommits) {
			// check the length to be 40 since git commit id is 40 digits long
			if (str.length === 40) {
				unmergedCommitList.push(str);
				str = "";
				continue;
			}

			str += id;

			if (str.length > 40) {
				this.error(
					`Unexpected string. Incorrect commit id length. Please check the commit id`,
				);
			}
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

	

		const commitSize =
			flags.batchSize <= unmergedCommitList.length
				? flags.batchSize
				: unmergedCommitList.length;
		const commitToReset = unmergedCommitList[commitSize - 1];
		
		// this.info(`Branch name: ${branchName} ${commitSize}`);

		// TODO: write a function that returns the commit id that has merge conflict with next branch
		// check only flags.batchSize number of commits

		// await gitRepo.switchBranch(flags.source);

		// const branchName = `${flags.source}-${flags.target}-${commitToReset}`;

		// await gitRepo.createBranch(branchName);
		// await gitRepo.setUpstream(branchName); 
		// await gitRepo.resetBranch(unmergedCommitList[0]);
		// 	// fetch name of owner associated to the pull request
		// 	const prInfo = await pullRequestInfo(flags.auth, unmergedCommitList[0], this.logger);
		// 	this.info(
		// 		`Fetch pull request info for single commit id ${unmergedCommitList[0]} and assignee ${prInfo.data[0].assignee.login}`,
		// 	);
		// 	const user = await getUserAccess(flags.auth, this.logger);
		// 	this.info(`List users with push access to main branch ${user}`);
		// 	prNumber = await createPullRequest(
		// 		flags.auth,
		// 		`${flags.source}-${flags.target}-${unmergedCommitList[0]}`,
		// 		flags.target,
		// 		prInfo.data[0].assignee.login,
		// 		this.logger,
		// 	);
		// 	this.log(
		// 		`Open pull request for commit id ${unmergedCommitList[0]}. Please resolve the merge conflicts.`,
		// 	);

	}
}
