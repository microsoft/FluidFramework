/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";

import { BaseCommand } from "../../base";
import { createPullRequest, getUserAccess, pullRequestExists, pullRequestInfo } from "../../lib";
import { GitRepo } from "@fluidframework/build-tools";

interface CommitStatus {
	isConflict: boolean;
	index: number;
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

	/**
	 *
	 * Function always returns an index in the array. The Boolean indicates whether the commit at that index conflicts or not.
	 * If the Boolean is false, then you know that all commits in the list are mergable.
	 * If the Boolean is true, then it indicates that the indexed commit conflicts.
	 * The primary role of the function is to check a list of commits for conflicts, and if there is one, to return the index of the conflict.
	 * hasConflicts(commits): [boolean, index]
	 */
	async hasConflicts(commitIds: string[], gitRepo: GitRepo): Promise<CommitStatus> {
		const length = commitIds.length;
		for (let i = 0; i < length; i++) {
			const commit = commitIds[i];
			// eslint-disable-next-line no-await-in-loop
			const mergesClean = await gitRepo.canMergeWithoutConflicts(commit);
			this.log(`Response from merge check for ${commitIds[i]}: ${mergesClean}`);
			if (mergesClean === false) {
				return { isConflict: true, index: i };
			}
		}

		// No conflicts found, return the last index
		return { isConflict: false, index: length - 1 };
	}

	public async run(): Promise<void> {
		const flags = this.flags;

		const title: string = `Automation: ${flags.source}-${flags.target} integrate`;

		const context = await this.getContext();
		const gitRepo = context.gitRepo;
		const prExists: boolean = await pullRequestExists(flags.auth, title, this.logger);

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
		// `branchToCheckConflicts` is used to check the conflicts of each commit with next.
		const branchToCheckConflicts = `${flags.target}-automation`;

		await gitRepo.switchBranch(flags.target);
		await gitRepo.createBranch(branchToCheckConflicts);
		await gitRepo.setUpstream(branchToCheckConflicts);

		const commitInfo = await this.hasConflicts(
			unmergedCommitList.slice(0, commitSize),
			gitRepo,
		);

		let commitId: string;

		/**
		 * `commitInfo.isConflict === true && commitInfo.index === 0` implies the first index has conflicts with next and open a single PR
		 * `commitInfo.isConflict === true && commitInfo.index !== 0` imples open PR till the last non-conflicting commit `--commitInfo.index` and set `isConflict` to false so that next can be merged later on
		 */
		if (commitInfo.isConflict === true && commitInfo.index === 0) {
			commitId = unmergedCommitList[0];
		} else if (commitInfo.isConflict === true && commitInfo.index !== 0) {
			commitId = unmergedCommitList[--commitInfo.index];
			commitInfo.isConflict = false;
		} else {
			commitId = unmergedCommitList[commitInfo.index];
		}

		const branchName = `${flags.source}-${flags.target}-${commitId.slice(0, 7)}`;

		await gitRepo.deleteBranch(branchToCheckConflicts);
		await gitRepo.switchBranch(flags.source);
		await gitRepo.createBranch(branchName);
		await gitRepo.setUpstream(branchName);
		await gitRepo.resetBranch(commitId);

		/**
		 * The below description is intended for PRs which has merge conflicts with next.
		 */
		let description: string = `## ${flags.source}-${flags.target} integrate PR
		The aim of this pull request is to sync ${flags.source} and ${flags.target} branch. This commit has **MERGE CONFLICTS** with ${flags.target}. The expectation from the assignee is as follows:
					
		> - Acknowledge the pull request by adding a comment -- "Actively working on it".
					
		> - Merge ${flags.target} into this ${branchName}.
					
		> - Resolve any merge conflicts between ${branchName} and ${flags.target} and push the resolution to this branch: ${branchName}. **Do NOT rebase or squash this branch: its history must be preserved**.
					
		> - Ensure CI is passing for this PR, fixing any issues.
					
		> - Recommended git commands: 
		git checkout ${branchName}
		git merge ${flags.target}
		**RESOLVE MERGE CONFLICTS**
		git add .
		git commit -m ${title}
		git push`;

		if (commitInfo.isConflict === false) {
			await gitRepo.mergeBranch(flags.target, title);

			/**
			 * The below description is intended for PRs which may have CI failures with next.
			 */
			description = `## ${flags.source}-${flags.target} integrate PR
			The aim of this pull request is to sync ${flags.source} and ${flags.target} branch. The expectation from the assignee is as follows:
						
			> - Acknowledge the pull request by adding a comment -- "Actively working on it".
						
			> - Resolve any CI failures between ${branchName} and ${flags.target} thereby pushing the resolution to this branch: ${branchName}. **Do NOT rebase or squash this branch: its history must be preserved**.
						
			> - Ensure CI is passing for this PR, fixing any issues. Please don't look into resolving **Real service e2e test** and **Stress test** failures as they are **non-required** CI failures.
			
			> - Recommended git commands: 
			git checkout ${branchName}
			**FIX THE CI FAILURES**
			git commit --amend -m ${title}
			git push --force-with-lease`;
		}

		/**
		 * fetch name of owner associated to the pull request
		 */
		const pr = await pullRequestInfo(flags.auth, commitId, this.logger);
		const author = pr.data[0].assignee.login;
		this.info(`Fetch pull request info for commit id ${commitInfo} and assignee ${author}`);
		const user = await getUserAccess(flags.auth, this.logger);
		this.info(`List users with push access to main branch ${user}`);

		const prObject = {
			token: flags.auth,
			source: branchName,
			target: flags.target,
			assignee: author,
			title,
			description,
		};

		const prNumber = await createPullRequest(prObject, this.logger);
		this.log(
			`Opened pull request ${prNumber} for commit id ${commitId}. Please resolve the merge conflicts.`,
		);
	}
}
