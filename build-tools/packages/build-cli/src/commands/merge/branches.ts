/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Logger } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import chalk from "chalk";
import { strict as assert } from "node:assert";

import { BaseCommand } from "../../base";
import { Repository, createPullRequest, getCommitInfo, pullRequestExists } from "../../lib";

interface CleanupBranch {
	branch: string;
	local: boolean;
	remote: boolean;
}

/**
 * This command class is used to merge two branches based on the batch size provided.
 * It looks for the last common commit between two branches and computes the remaining commits to be merged.
 * Later, it creates a pull request based on the batch size passed.
 */
export default class MergeBranch extends BaseCommand<typeof MergeBranch> {
	static description = "Sync branches depending on the batch size passed";

	static flags = {
		pat: Flags.string({
			description:
				"GitHub Personal Access Token. This parameter should be passed using the GITHUB_PAT environment variable for security purposes.",
			char: "p",
			required: true,
			env: "GITHUB_PAT",
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
		reviewers: Flags.string({
			description: "Add reviewers to PR",
			required: true,
			multiple: true,
		}),
		createPr: Flags.boolean({
			description: "Use --no-createPr to skip creating a PR. Useful for testing.",
			hidden: true,
			default: true,
			allowNo: true,
		}),
		checkPr: Flags.boolean({
			description: "Use --no-checkPr to skip checking for a PR. Useful for testing.",
			hidden: true,
			default: true,
			allowNo: true,
		}),
		cleanup: Flags.boolean({
			description:
				"Use --no-cleanup to skip cleanup of branches if there's a failure. Useful for testing.",
			hidden: true,
			default: true,
			allowNo: true,
		}),
		...BaseCommand.flags,
	};

	/**
	 * The branch that the command was run from. This is used to checkout the branch in the case of a failure, so the user
	 * is on the starting branch.
	 */
	private initialBranch: string = "";

	/**
	 * A list of local branches that should be deleted if the command fails. The local/remote booleans indicate whether
	 * the branch should be cleaned up locally, remotely, or both.
	 */
	private readonly branchesToCleanup: CleanupBranch[] = [];

	private gitRepo: Repository | undefined;
	private remote: string | undefined;

	public async run(): Promise<void> {
		const flags = this.flags;

		const prTitle: string = `Automation: ${flags.source}-${flags.target} integrate`;
		const context = await this.getContext();
		this.gitRepo ??= new Repository({ baseDir: context.gitRepo.resolvedRoot });

		if (this.gitRepo === undefined) {
			this.errorLog(`gitRepo undefined: ${JSON.stringify(this.gitRepo)}`);
			this.error("gitRepo is undefined", { exit: 1 });
		}

		const [owner, repo] = context.originRemotePartialUrl.split("/");
		this.verbose(`owner: ${owner} and repo: ${repo}`);

		// eslint-disable-next-line unicorn/no-await-expression-member
		this.initialBranch = (await this.gitRepo.gitClient.status()).current ?? "main";

		this.remote =
			flags.remote ?? (await this.gitRepo.getRemote(context.originRemotePartialUrl));
		this.verbose(`Remote is: ${this.remote}`);

		if (flags.checkPr) {
			// Check if a branch integration PR exists already, based on its **name**.
			const prData = await pullRequestExists(flags.pat, prTitle, owner, repo, this.logger);

			if (prData.found) {
				this.log(`Found open PR #${prData.number} at ${prData.url}`);
				return;
				// eslint-disable-next-line no-warning-comments
				// TODO: notify the author
			}

			this.log(`No open pull request.`);
		} else {
			this.info(`Skipping PR check.`);
		}

		// Find the last merged commit between the source and target branches. Use the remote refs since we don't need to
		// check out local versions of the branches yet.
		const remoteSourceBranch = `refs/remotes/${this.remote}/${flags.source}`;
		const remoteTargetBranch = `refs/remotes/${this.remote}/${flags.target}`;
		const lastMergedCommit = await this.gitRepo.getMergeBase(
			remoteSourceBranch,
			remoteTargetBranch,
		);
		this.log(
			`${lastMergedCommit} is the last merged commit id between ${flags.source} and ${flags.target}`,
		);

		const unmergedCommitList: string[] = await this.gitRepo.revList(
			lastMergedCommit,
			flags.source,
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
		this.verbose(`Unmerged commit list: ${unmergedCommitList.map((c) => shortCommit(c))}`);

		/**
		 * tempBranchToCheckConflicts is used to check the conflicts of each commit with the target branch.
		 */
		const tempBranchToCheckConflicts = `${flags.target}-automation`;
		this.branchesToCleanup.push({
			branch: tempBranchToCheckConflicts,
			local: true,
			remote: false,
		});

		// Check out a new temp branch at the same commit as the target branch.
		await this.gitRepo.gitClient.checkoutBranch(tempBranchToCheckConflicts, remoteTargetBranch);

		const commitBatchSize = Math.min(flags.batchSize, unmergedCommitList.length);
		const [commitListHasConflicts, conflictingCommitIndex] = await hasConflicts(
			unmergedCommitList.slice(0, commitBatchSize),
			this.gitRepo,
			this.logger,
		);
		this.verbose(
			`Conflicting commit: ${unmergedCommitList[conflictingCommitIndex]} at index ${conflictingCommitIndex}`,
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
		// Create a new local branch to serve as the merge HEAD, at the prHeadCommit found earlier.
		const mergeBranch = `${flags.source}-${flags.target}-${shortCommit(prHeadCommit)}`;
		this.log(
			`Creating and checking out new branch: ${mergeBranch} at commit ${shortCommit(
				prHeadCommit,
			)}`,
		);
		await this.gitRepo.gitClient.checkoutBranch(mergeBranch, prHeadCommit);
		// Clean up the local mergeBranch in case of a failure.
		this.branchesToCleanup.push({ branch: mergeBranch, local: true, remote: false });

		// Delete the temp branch we created earlier. It's safe to delete the branch now because we checked out a new branch
		// in the previous step.
		this.verbose(`Deleting temp branch: ${tempBranchToCheckConflicts}`);
		await this.gitRepo.gitClient.branch(["--delete", tempBranchToCheckConflicts, "--force"]);

		// If we determined that the PR won't conflict, merge the remote target branch with the HEAD (which is mergeBranch
		// that we created and checked out earlier). We will create the PR at the new commit; in other words, the PR will
		// already contain a merge, and once CI has passed, the target branch can be fast-forwarded directly to it to close
		// and merge the PR.
		if (prWillConflict === false) {
			await this.gitRepo.gitClient
				.fetch(this.remote)
				.merge([remoteTargetBranch, "-m", prTitle]);
		}

		// To determine who to assign the PR to, we look up the commit details on GitHub.
		// TODO: Can't we get the author info from the local commit?
		const commitInfo = await getCommitInfo(flags.pat, owner, repo, prHeadCommit, this.logger);
		if (commitInfo === undefined) {
			this.warning(
				`Couldn't determine who to assign the PR to, so it must be manually assigned.`,
			);
		}
		const assignee = commitInfo.data.author.login;

		// The PR description differs based on whether we expect a conflict or not.
		const getDescription = prWillConflict
			? getMergeConflictsDescription
			: getMaybeCiFailuresDescription;
		const description: string = getDescription({
			source: flags.source,
			target: flags.target,
			mergeBranch,
			prTitle,
		});

		// label the conflicting PRs and the merged-OK PRs with different labels
		const getLabels = prWillConflict
			? ["merge-conflict", "main-next-integrate"]
			: ["merge-ok", "main-next-integrate"];

		this.info(`Creating PR for commit id ${prHeadCommit} assigned to ${assignee}`);
		const prObject = {
			token: flags.pat,
			owner,
			repo,
			source: mergeBranch,
			target: flags.target,
			assignee,
			title: prTitle,
			description,
			reviewers: flags.reviewers,
			labels: getLabels,
		};
		this.verbose(`PR object: ${JSON.stringify(prObject)}}`);

		if (flags.createPr) {
			// We're about to create the PR, so we need to push mergeBranch upstream
			// Also push the local branch to the remote and set its upstream.
			await this.gitRepo.gitClient
				.push(this.remote, mergeBranch)
				.branch(["--set-upstream-to", `${this.remote}/${mergeBranch}`]);
			let prNumber = "";
			try {
				prNumber = await createPullRequest(prObject, this.logger);
			} catch (error: unknown) {
				// There was an error when creating the pull request, so clean up the remote branch.
				this.errorLog(`Error creating pull request: ${error}`);
				this.branchesToCleanup.push({ branch: mergeBranch, local: true, remote: true });
				throw error;
			}
			this.log(`Opened pull request ${prNumber} for commit id ${prHeadCommit}`);
		} else {
			this.info(`Skipped opening pull request.`);
		}

		await this.doCleanup();
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

		if (this.flags.cleanup === true && err.exitCode !== undefined && err.exitCode !== 0) {
			await this.doCleanup();
		}

		return super.catch(err);
	}

	private async doCleanup(): Promise<void> {
		assert(this.gitRepo !== undefined);

		// Check out the initial branch
		this.warning(`CLEANUP: Checking out initial branch ${this.initialBranch}`);
		await this.gitRepo.gitClient.checkout(this.initialBranch);

		// Delete the branches we created
		if (this.branchesToCleanup.length > 0) {
			this.warning(
				`CLEANUP: Deleting local branches: ${this.branchesToCleanup
					.map((b) => b.branch)
					.join(", ")}`,
			);
			await this.gitRepo.gitClient.deleteLocalBranches(
				this.branchesToCleanup.filter((b) => b.local).map((b) => b.branch),
				true /* forceDelete */,
			);
		}

		// Delete any remote branches we created
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
		for (const branch of this.branchesToCleanup.filter((b) => b.remote)) {
			promises.push(deleteFunc(branch.branch));
		}
		await Promise.all(promises);
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
	for (const [i, commit] of commitIds.entries()) {
		// eslint-disable-next-line no-await-in-loop
		const mergesClean = await gitRepo.canMergeWithoutConflicts(commit);
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

/**
 * The below description is intended for PRs which has merge conflicts with next.
 */
function getMergeConflictsDescription(props: {
	source: string;
	target: string;
	mergeBranch: string;
	prTitle: string;
}): string {
	const { source, target, mergeBranch, prTitle } = props;
	return `
## ${source}-${target} integrate PR

The aim of this pull request is to sync ${source} and ${target} branch. This branch has **MERGE CONFLICTS** with ${target} due to this commit. If this PR is assigned to you, you need to do the following:

- Acknowledge the pull request by adding a comment -- "Actively working on it".
- Merge ${target} into this branch, ${mergeBranch}.
- Resolve any merge conflicts between ${mergeBranch} and ${target} and then push the results to upstream. **Do NOT rebase or squash this branch: its history must be preserved**.
- Address any CI failures.
- Recommended git commands:
  - \`git checkout ${mergeBranch}\` -- check out the PR branch.
  - \`git merge ${target}\` -- merge ${target} into ${mergeBranch}
  - **RESOLVE MERGE CONFLICTS**
  - \`git add .\` -- stage all the local changes
  - \`git commit -m ${prTitle}\` -- commit the merge
  - \`git push upstream\` -- and push it to upstream (your upstream remote name may be different)`;
}

/**
 * The below description is intended for PRs which may have CI failures with next.
 */
function getMaybeCiFailuresDescription(props: {
	source: string;
	target: string;
	mergeBranch: string;
	prTitle: string;
}): string {
	const { source, target, mergeBranch, prTitle } = props;
	return `
## ${source}-${target} integrate PR

The aim of this pull request is to sync ${source} and ${target} branch. If this PR is assigned to you, you need to do the following:

- Acknowledge the pull request by adding a comment -- "Actively working on it".
- Resolve any CI failures between ${mergeBranch} and ${target} and push the results to upstream. **Do NOT rebase or squash this branch: its history must be preserved**.
- Address any CI failures. Ignore any **Real service e2e test** and **Stress test** failures because they are **non-required** CI workflows.
- Recommended git commands:
  - \`git checkout ${mergeBranch}\` -- check out the PR branch.
  - **FIX ANY CI FAILURES**
  - git commit --amend -m ${prTitle}
  - git push --force-with-lease`;
}
