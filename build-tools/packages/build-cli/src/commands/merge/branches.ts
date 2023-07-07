/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Logger } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import chalk from "chalk";

import { BaseCommand } from "../../base";
import {
	Repository,
	createPullRequest,
	getUserAccess,
	pullRequestExists,
	pullRequestInfo,
} from "../../lib";

/**
 * This command class is used to merge two branches based on the batch size provided.
 * It looks for the last common commit between two branches and computes the remaining commits to be merged.
 * Later, it creates a pull request based on the batch size passed.
 */
export default class MergeBranch extends BaseCommand<typeof MergeBranch> {
	static description = "Sync branches depending on the batch size passed";

	static flags = {
		auth: Flags.string({
			description:
				"GitHub authentication token. For security reasons, this value should be passed using the GITHUB_TOKEN environment variable.",
			char: "a",
			required: true,
			env: "GITHUB_TOKEN",
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
		remote: Flags.string({
			description: "",
			char: "r",
			default: "origin",
		}),
		...BaseCommand.flags,
	};

	/**
	 * The branch that the command was run from. This is used to checkout the branch in the case of a failure.
	 */
	private initialBranch: string = "";

	/**
	 * A list of branches that should be deleted if the command fails.
	 */
	private readonly branchesToCleanup: string[] = [];

	private gitRepo: Repository | undefined;
	private remote: string | undefined;

	public async run(): Promise<void> {
		const flags = this.flags;

		const prTitle: string = `Automation: ${flags.source}-${flags.target} integrate`;
		const context = await this.getContext();
		this.gitRepo ??= new Repository({ baseDir: context.gitRepo.resolvedRoot });

		if (this.gitRepo === undefined) {
			this.log(`gitRepo undefined: ${JSON.stringify(this.gitRepo)}`);
			this.error("gitRepo is undefined", { exit: 1 });
		}

		// const [owner, repo] = context.originRemotePartialUrl.split("/");
		const owner = "sonalideshpandemsft";
		const repo = "FluidFramework";

		this.log(`owner: ${owner} and repo: ${repo}`);

		// eslint-disable-next-line unicorn/no-await-expression-member
		this.initialBranch = (await this.gitRepo.gitClient.status()).current ?? "main";

		this.log(`initial branch: ${this.initialBranch}`);

		this.remote = flags.remote;
		this.log(`remote: ${this.remote}`);
		const prExists: boolean = await pullRequestExists(
			flags.auth,
			prTitle,
			owner,
			repo,
			this.logger,
		);

		this.log(`prExists: ${prExists}`);
		if (prExists) {
			this.verbose(`Open pull request exists`);
			this.exit(-1);
			// eslint-disable-next-line no-warning-comments
			// TODO: notify the author
		}

		const lastMergedCommit = await this.gitRepo.getMergeBase(flags.source, flags.target);
		this.log(
			`${lastMergedCommit} is the last merged commit id between ${flags.source} and ${flags.target}`,
		);

		const unmergedCommitList: string[] = await this.gitRepo.revList(
			lastMergedCommit,
			`refs/remotes/${this.remote}/${flags.source}`,
		);

		if (unmergedCommitList.length === 0) {
			this.log(
				chalk.green(
					`${flags.source} and ${flags.target} branches are in sync. No commits to merge`,
				),
			);
			this.exit(0);
		}

		this.log(
			`There are ${unmergedCommitList.length} unmerged commits between the ${flags.source} and ${flags.target} branches`,
		);

		const commitSize = Math.min(flags.batchSize, unmergedCommitList.length);
		// `tempBranchToCheckConflicts` is used to check the conflicts of each commit with the target branch.
		const tempBranchToCheckConflicts = `${flags.target}-automation`;
		this.branchesToCleanup.push(tempBranchToCheckConflicts);

		await this.gitRepo.gitClient
			.checkoutBranch(tempBranchToCheckConflicts, flags.target)
			.push(this.remote, tempBranchToCheckConflicts)
			.branch(["--set-upstream-to", `${this.remote}/${tempBranchToCheckConflicts}`]);

		const [commitListHasConflicts, conflictingCommitIndex] = await hasConflicts(
			unmergedCommitList.slice(0, commitSize),
			this.gitRepo,
			this.logger,
		);
		this.verbose(
			`conflicting commit: ${unmergedCommitList[conflictingCommitIndex]} at index ${conflictingCommitIndex}`,
		);

		/**
		 * The commit that should be used as the HEAD for the PR.
		 */
		let prHeadCommit = "";

		/**
		 * True if the PR is expected to have conflicts, false otherwise.
		 */
		let prWillConflict: boolean;

		if (commitListHasConflicts === true) {
			// There's a conflicting commit in the list, so we need to determine which commit to use as the HEAD for the PR.
			if (conflictingCommitIndex === 0) {
				// If it's the first item in the list that conflicted, then we want to open a single PR with the HEAD at that
				// commit. The PR is expected to conflict with the target branch, so we set `prWillConflict` to true. The PR owner will need to merge the branch
				// manually with next and push back to the PR, and then merge once CI passes.
				prHeadCommit = unmergedCommitList[0];
				prWillConflict = true;
			} else {
				// Otherwise, we want to open a PR with the HEAD at the commit BEFORE the first conflicting commit.
				prHeadCommit = unmergedCommitList[conflictingCommitIndex - 1];
				prWillConflict = false;
			}
		} else {
			// No conflicting commits, so set the commit to merge to the last commit in the list.
			prHeadCommit = unmergedCommitList[conflictingCommitIndex];
			prWillConflict = false;
		}

		const branchName = `${flags.source}-${flags.target}-${shortCommit(prHeadCommit)}`;
		this.branchesToCleanup.push(branchName);

		this.verbose(
			`Creating and checking out branch: ${branchName} at commit ${shortCommit(
				prHeadCommit,
			)}`,
		);
		await this.gitRepo.gitClient
			.checkoutBranch(branchName, prHeadCommit)
			.push(this.remote, branchName)
			.branch(["--set-upstream-to", `${this.remote}/${branchName}`]);

		this.verbose(`Deleting temp branch: ${tempBranchToCheckConflicts}`);
		await this.gitRepo.gitClient.branch(["--delete", tempBranchToCheckConflicts, "--force"]);

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
		git commit -m ${prTitle}
		git push`;

		if (prWillConflict === false) {
			await this.gitRepo.gitClient.merge([flags.target, "-m", prTitle]);

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
			git commit --amend -m ${prTitle}
			git push --force-with-lease`;
		}

		/**
		 * fetch name of owner associated to the pull request
		 */
		const pr = await pullRequestInfo(flags.auth, owner, repo, prHeadCommit, this.logger);
		console.debug(pr);
		const author = pr.data?.[0]?.assignee?.login;
		this.info(
			`Fetching pull request info for commit id ${prHeadCommit} and assignee ${author}`,
		);
		const user = await getUserAccess(flags.auth, owner, repo, this.logger);
		this.verbose(`List users with push access to main branch: ${JSON.stringify(user.data)}`);

		const prObject = {
			token: flags.auth,
			owner,
			repo,
			source: branchName,
			target: flags.target,
			assignee: author,
			title: prTitle,
			description,
		};

		const prNumber = await createPullRequest(prObject, this.logger);
		this.log(
			`Opened pull request ${prNumber} for commit id ${prHeadCommit}. Please resolve the merge conflicts.`,
		);
	}

	/**
	 * This method is called when an unhandled exception is thrown, or when the command exits with an error code. if
	 * possible, this code cleans up the temporary branches that were created. It cleans up both local and remote
	 * branches.
	 */
	protected override async catch(err: Error & { exitCode?: number | undefined }): Promise<any> {
		if (this.gitRepo === undefined) {
			throw err;
		}

		// Check out the initial branch
		this.warning(`CLEANUP: checking out initial branch ${this.initialBranch}`);
		await this.gitRepo.gitClient.checkout(this.initialBranch);

		// Delete the branches we created
		this.warning(`CLEANUP: Deleting local branches: ${this.branchesToCleanup.join(", ")}`);
		await this.gitRepo.gitClient.deleteLocalBranches(
			this.branchesToCleanup,
			true /* forceDelete */,
		);

		// Delete the remote branches we created
		const promises: Promise<unknown>[] = [];
		// eslint-disable-next-line unicorn/consistent-function-scoping
		const deleteFunc = async (branch: string) => {
			this.warning(`CLEANUP: Deleting remote branch ${this.remote}/${branch}`);
			try {
				await this.gitRepo?.gitClient.push(this.remote, branch, ["--delete"]);
			} catch {
				this.verbose(`CLEANUP: FAILED to delete remote branch ${this.remote}/${branch}`);
			}
		};
		for (const branch of this.branchesToCleanup) {
			promises.push(deleteFunc(branch));
		}
		await Promise.all(promises);
		throw err;
	}
}

/**
 * Function always returns an index in the array. The Boolean indicates whether the commit at that index conflicts or
 * not. If the Boolean is false, then you know that all commits in the list are mergable. If the Boolean is true, then
 * it indicates that the indexed commit conflicts. The primary role of the function is to check a list of commits for
 * conflicts, and if there is one, to return the index of the conflict.
 *
 * @param commitIds - An array of commit ids to check for conflicts.
 * @param gitRepo - The git repository to check for conflicts in.
 * @param log - An optional logger to use.
 * @returns a Boolean that indicates whether the commit at that index conflicts or not
 */
async function hasConflicts(
	commitIds: string[],
	gitRepo: Repository,
	log?: Logger,
): Promise<[boolean, number]> {
	log?.log(`hasConflicts`);
	for (const [i, commit] of commitIds.entries()) {
		// eslint-disable-next-line no-await-in-loop
		const mergesClean = await gitRepo.canMergeWithoutConflicts(commit);
		log?.log(`hasConflicts mergesClean-----------------------${mergesClean}`);
		log?.verbose(`Can merge without conflicts ${commit}: ${mergesClean}`);
		if (mergesClean === false) {
			return [true, i];
		}
	}

	// No conflicts found, return the last index
	return [false, commitIds.length - 1];
}

function shortCommit(commit: string): string {
	return commit.slice(0, 7);
}
