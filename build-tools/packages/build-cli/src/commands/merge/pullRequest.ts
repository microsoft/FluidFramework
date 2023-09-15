/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
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
		mergeStrategy: Flags.custom<"squash" | "merge">({
			description: "PR Merge Startegy",
			char: "m",
			default: "squash",
			parse: async (input) => {
				if (input === "squash" || input === "merge") {
					return input;
				}

				throw new Error(`Invalid merge strategy: ${input}`);
			},
		})(),
		...BaseCommand.flags,
	};

	private gitRepo: Repository | undefined;

	public async run(): Promise<void> {
		const flags = this.flags;

		const context = await this.getContext();
		this.gitRepo ??= new Repository({ baseDir: context.gitRepo.resolvedRoot });
		if (this.gitRepo === undefined) {
			this.errorLog(`gitRepo undefined: ${JSON.stringify(this.gitRepo)}`);
			this.error("gitRepo is undefined", { exit: 1 });
		}

		const [owner, repo] = context.originRemotePartialUrl.split("/");
		this.log(`owner: ${owner} and repo: ${repo}`);

		const pr1 = {
			token: flags.pat,
			owner: "sonalideshpandemsft",
			repo: "FluidFramework",
			prNumber: flags.prNumber,
		};

		const info = await getPullRequestInfo(pr1, this.logger);
		const pr = {
			token: flags.pat,
			owner: "sonalideshpandemsft",
			repo: "FluidFramework",
			title: JSON.stringify(info.data.title),
			description: JSON.stringify(info.data.body),
			prNumber: flags.prNumber,
			strategy: flags.mergeStrategy,
		};

		// squash pull request

		if (flags.mergeStrategy === "squash") {
			const response = await mergePullRequest(pr, this.logger);
			this.log(`Squash merge PRs: ${JSON.stringify(response)}`);
		}

		// merge pr
		if (flags.mergeStrategy === "merge") {
			// fetch the automation pr
			// find the commit id
			const commitInfo = await listCommitsPullRequest(pr, this.logger);
			this.log(`Number of commits: ${commitInfo.length}`);

			await filterCommits(commitInfo, this.gitRepo, this.logger);
			this.log(`Merge Pull Request`);

			// create comment on the automation pr - "this PR is queued to be merged in next in 10mins. please close the PR if you want to stop the merge"
		}
	}
}

async function filterCommits(
	commitDataArray: CommitData[],
	gitRepo: Repository,
	log: CommandLogger,
): Promise<any> {
	const automationTitle = "Automation: main next integrate";
	const filteredCommits = commitDataArray.filter(
		(commit) => commit.commit.message === "Automation: main next integrate",
	);

	log.log(`filteredCommits: ${JSON.stringify(filteredCommits)}`);

	if (filteredCommits.length > 1) {
		log.log("More the one commit with the name automation...");
	}

	if (filteredCommits.length === 1) {
		// Check if the last element's commit message is "Automation: main next integrate"
		if (
			commitDataArray.length > 0 &&
			commitDataArray[commitDataArray.length - 1].commit.message === automationTitle
		) {
			log.log(`The last commit has the message ${automationTitle}`);
			const sha = filteredCommits[0].sha;
			await mergeAutomationPullRequest(sha, gitRepo);
		} else {
			log.log(
				`The last commit does not have the message ${automationTitle}. The fixup commit is named/pushed incorrectly`,
			);
		}
	}
}

async function mergeAutomationPullRequest(sha: string, gitRepo: Repository) {
	// git checkout next
	await gitRepo.gitClient.checkout("test-1");
	// git fetch
	await gitRepo.gitClient.fetch();
	// git pull
	await gitRepo.gitClient.pull();
	// git merge --ff-only sha
	await gitRepo.gitClient.merge(["--ff-only", sha]);
	// git push
	await gitRepo.gitClient.push();
}
