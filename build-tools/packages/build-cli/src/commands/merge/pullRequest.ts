/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import { promises as fs } from "fs";
import { BaseCommand } from "../../base";
import {
	Repository,
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

interface PRObject {
	token: string;
	owner: string;
	repo: string;
	title?: string;
	description?: string;
	prNumber: number;
	strategy?: "squash" | "merge";
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
			description: "PR number",
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

	public async run(): Promise<void> {
		const flags = this.flags;

		let mergeStrategy = MergeStrategy.Squash;

		const context = await this.getContext();
		this.gitRepo ??= new Repository({ baseDir: context.gitRepo.resolvedRoot });
		if (this.gitRepo === undefined) {
			this.errorLog(`gitRepo undefined: ${JSON.stringify(this.gitRepo)}`);
			this.error("gitRepo is undefined", { exit: 1 });
		}

		const [owner, repo] = context.originRemotePartialUrl.split("/");
		this.log(`owner: ${owner} and repo: ${repo}`);

		const pr1: PRObject = {
			token: flags.pat,
			owner: "sonalideshpandemsft",
			repo: "FluidFramework",
			prNumber: flags.prNumber,
		};

		const info = await getPullRequestInfo(pr1, this.logger);

		// Convert the 'info' object to a JSON string
		const jsonData = JSON.stringify(info, null, 2);

		// Write the JSON data to the file
		await fs.writeFile("file.json", jsonData, "utf-8");

		const title = JSON.stringify(info.data.title);
		const description = JSON.stringify(info.data.body);
		const labels = info.data.labels;
		const arr = [];

		for (const label of labels) {
			arr.push(label.name);
			this.log(`Labels list: ${label.name}`);

			if (
				label.name === "main-next-integrate" &&
				title === "Automation: main-next integrate"
			) {
				mergeStrategy = MergeStrategy.Merge;
			}
		}

		const pr = {
			...pr1,
			title,
			description,
			strategy: mergeStrategy,
		};

		// squash pull request
		if (mergeStrategy === MergeStrategy.Squash) {
			const response = await mergePullRequest(pr, this.logger);
			this.log(`Squash merge PRs: ${JSON.stringify(response)}`);
		}

		// merge pr
		if (mergeStrategy === MergeStrategy.Merge) {
			// find the commit id
			const commitInfo = await listCommitsPullRequest(pr, this.logger);
			this.log(`Number of commits: ${commitInfo.length}`);

			// create comment on the automation pr - "this PR is queued to be merged in next in 10mins. please close the PR if you want to stop the merge"

			await filterCommits(commitInfo, flags.targetBranch, this.gitRepo, this.logger);
			this.log(`Merge Pull Request`);
		}
	}
}

async function filterCommits(
	commitDataArray: CommitData[],
	branch: string,
	gitRepo: Repository,
	log: CommandLogger,
): Promise<any> {
	const automationTitle = "Automation: main-next integrate";
	const filteredCommits = commitDataArray.filter(
		(commit) => commit.commit.message === "Automation: main-next integrate",
	);

	if (filteredCommits.length > 1) {
		log.log("More the one commit with the name automation...");
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
			log.log(
				`The last commit does not have the message ${automationTitle}. The fixup commit is named/pushed incorrectly`,
			);
		}
	}
}

async function mergeAutomationPullRequest(sha: string, branch: string, gitRepo: Repository) {
	// git checkout next
	await gitRepo.gitClient.checkout(branch);
	// git fetch
	await gitRepo.gitClient.fetch();
	// git pull
	await gitRepo.gitClient.pull();
	// git merge --ff-only sha
	await gitRepo.gitClient.merge(["--ff-only", sha]);
	// git push
	await gitRepo.gitClient.push();
}
