/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import { BaseCommand } from "../../base";
import {
	Repository,
	createComment,
	getPullRequestInfo,
	listCommitsPullRequest,
	mergePullRequest,
} from "../../lib";
import { CommandLogger } from "../../logging";

interface CommitData {
	sha: string;
	commit: {
		message: string;
	};
}

interface PullRequestWithComment {
	token: string;
	owner: string;
	repo: string;
	prNumber: number;
	comment: string;
}

interface PullRequestWithDetails {
	title: string;
	description: string;
	mergeStrategy: MergeStrategy;
}

enum MergeStrategy {
	Merge = "merge",
	Squash = "squash",
}

export default class MergePullRequest extends BaseCommand<typeof MergePullRequest> {
	static readonly description = "Merge Pull Request";

	static flags = {
		pat: Flags.string({
			description:
				"GitHub Personal Access Token. This parameter should be passed using the GITHUB_PAT environment variable for security purposes.",
			char: "p",
			required: true,
			env: "GITHUB_PAT",
		}),
		prNumber: Flags.integer({
			description: "Pull request number",
			char: "n",
			required: true,
		}),
		targetBranch: Flags.string({
			description: "Target branch name",
			char: "t",
			required: true,
		}),
		...BaseCommand.flags,
	};

	private gitRepo: Repository | undefined;
	private owner: string = "";
	private repo: string = "";
	private readonly automationTitle = "Automation: main-next integrate";

	public async run(): Promise<void> {
		const flags = this.flags;

		const context = await this.getContext();
		this.gitRepo ??= new Repository({ baseDir: context.gitRepo.resolvedRoot });
		if (this.gitRepo === undefined) {
			this.error("gitRepo is undefined", { exit: 1 });
		}

		[this.owner, this.repo] = context.originRemotePartialUrl.split("/");
		this.log(`owner: ${this.owner} and repo: ${this.repo}`);

		const prComment: PullRequestWithComment = {
			token: flags.pat,
			owner: this.owner,
			repo: this.repo,
			prNumber: flags.prNumber,
			comment: `This PR is queued to be merged in ${flags.targetBranch} in 10mins. Please close the PR if you ***DO NOT*** wish to merge`,
		};

		// get the merge strategy: merge or squash
		const details = await getMergeStrategy(prComment, this.automationTitle, this.logger);

		const prDetails = {
			token: flags.pat,
			owner: this.owner,
			repo: this.repo,
			prNumber: flags.prNumber,
			title: details.title,
			description: details.description,
			mergeStrategy: details.mergeStrategy,
		};

		this.log(`Pull Request Details: ${prDetails}`);

		// squash pull request
		if (prDetails.mergeStrategy === MergeStrategy.Squash) {
			const response = await mergePullRequest(prDetails, this.logger);
			this.log(`Squash PR repsonse: ${JSON.stringify(response)}`);

			if (response !== 200) {
				this.errorLog(`Pull Request is not mergeable`);
				return;
			}
		}

		// merge pull request
		if (prDetails.mergeStrategy === MergeStrategy.Merge) {
			// find the commit id
			const commitInfo = await listCommitsPullRequest(prDetails, this.logger);
			this.log(`Number of commits: ${commitInfo.length}`);

			await filterCommits(
				commitInfo,
				flags.targetBranch,
				this.automationTitle,
				this.gitRepo,
				this.logger,
			);
			this.log(`Merge Pull Request`);
		}
	}

	protected override async catch(err: Error & { exitCode?: number }): Promise<any> {
		this.log(`Cannot merge pull request: ${err}`);
		const comment: PullRequestWithComment = {
			token: this.flags.pat,
			owner: this.owner,
			repo: this.repo,
			prNumber: this.flags.prNumber,
			comment: `Cannot merge pull request: ${err}`,
		};
		await createComment(comment);
	}
}

async function getMergeStrategy(
	prComment: PullRequestWithComment,
	automationTitle: string,
	log: CommandLogger,
): Promise<PullRequestWithDetails> {
	let mergeStrategy = MergeStrategy.Squash;

	// create comment on the pr
	const comment = await createComment(prComment, log);
	log.log(`Comment created on PR ${prComment.prNumber}: ${JSON.stringify(comment)}`);

	// Wait for 10 minutes
	const delayMilliseconds = 10 * 60 * 1000;
	setTimeout(() => {
		log.log("Wait for 10 mins");
	}, delayMilliseconds);

	const info = await getPullRequestInfo(prComment, log);

	const title: string = info.data.title;
	const description: string = info.data.body;
	const labels = info.data.labels;
	const state = JSON.stringify(info.data.state);
	const arr = [];

	if (state === "closed") {
		log.errorLog(`PR is closed`);
	}

	for (const label of labels) {
		arr.push(label.name);
		log.log(`Labels list: ${label.name}`);

		if (label.name === "main-next-integrate" && title === automationTitle) {
			mergeStrategy = MergeStrategy.Merge;
		}
	}

	return { title, description, mergeStrategy };
}

async function filterCommits(
	commitDataArray: CommitData[],
	branch: string,
	automationTitle: string,
	gitRepo: Repository,
	log: CommandLogger,
): Promise<any> {
	const filteredCommits = commitDataArray.filter(
		(commit) => commit.commit.message === automationTitle,
	);

	if (filteredCommits.length > 1) {
		log.errorLog(`More the one commit with the name ${automationTitle}`);
		return;
	}

	if (filteredCommits.length === 1) {
		// Check if the last element's commit message is "Automation: main-next integrate"
		if (
			commitDataArray.length > 0 &&
			commitDataArray[commitDataArray.length - 1].commit.message === automationTitle
		) {
			log.log(`The last commit has the message ${automationTitle}`);
			const sha = filteredCommits[0].sha;
			await mergeAutomationPullRequest(sha, branch, gitRepo);
		} else {
			log.errorLog(
				`The last commit does not have the message ${automationTitle}. The fixup commit is named incorrectly`,
			);
		}
	}
}

async function mergeAutomationPullRequest(sha: string, branch: string, gitRepo: Repository) {
	// git checkout next
	await gitRepo.gitClient.checkout(branch);
	// git fetch and pull
	await gitRepo.gitClient.fetch().pull();
	// git merge --ff-only sha
	await gitRepo.gitClient.merge(["--ff-only", sha]);
	// git push
	await gitRepo.gitClient.push();
}
