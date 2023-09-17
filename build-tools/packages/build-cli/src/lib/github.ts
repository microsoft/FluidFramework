/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Octokit } from "@octokit/core";
import { CommandLogger } from "../logging";

const PULL_REQUEST_EXISTS = "GET /repos/{owner}/{repo}/pulls";
const COMMIT_INFO = "GET /repos/{owner}/{repo}/commits/{ref}";
const PULL_REQUEST = "POST /repos/{owner}/{repo}/pulls";
const ASSIGNEE = "POST /repos/{owner}/{repo}/issues/{issue_number}/assignees";
const LABEL = "POST /repos/{owner}/{repo}/issues/{issue_number}/labels";
const REVIEWER = "POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers";
const MERGE_PULL_REQUEST = "PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge";

/**
 *
 * @param token - GitHub authentication token
 * @returns Returns true if pull request exists
 */
export async function pullRequestExists(
	token: string,
	title: string,
	owner: string,
	repo: string,
	log: CommandLogger,
): Promise<{ found: boolean; url?: string; number?: number }> {
	log.verbose(`Checking if pull request with title="${title}" exists----------------`);
	const octokit = new Octokit({ auth: token });
	const response = await octokit.request(PULL_REQUEST_EXISTS, { owner, repo });

	const found = response.data.find((d) => d.title === title);
	if (found === undefined) {
		return { found: false };
	}

	return {
		found: true,
		url: found.html_url,
		number: found.number,
	};
}

/**
 *
 * @param token - GitHub authentication token
 * @param commit_sha - Commit id for which we need pull request information
 */
export async function getCommitInfo(
	token: string,
	owner: string,
	repo: string,
	commit_sha: string,
	log: CommandLogger,
): Promise<any> {
	const octokit = new Octokit({ auth: token });

	const prInfo = await octokit.request(COMMIT_INFO, {
		owner,
		repo,
		ref: commit_sha,
	});

	log.verbose(`Get info from ref: ${JSON.stringify(prInfo)}`);
	return prInfo;
}

/**
 *
 * @param auth - GitHub authentication token
 * @param source - Source branch name
 * @param target - Target branch name
 * @param author - Assignee name
 * @returns Pull request number
 */
export async function createPullRequest(
	pr: {
		token: string;
		owner: string;
		repo: string;
		source: string;
		target: string;
		assignee: string;
		title: string;
		description: string;
		reviewers: string[];
		labels: string[];
	},
	log: CommandLogger,
): Promise<any> {
	log.verbose(`Creating a pull request---------------`);
	const octokit = new Octokit({ auth: pr.token });
	const newPr = await octokit.request(PULL_REQUEST, {
		owner: pr.owner,
		repo: pr.repo,
		title: pr.title,
		body: pr.description,
		head: pr.source,
		base: pr.target,
	});

	log.verbose(`Assigning ${pr.assignee} to pull request ${newPr.data.number}`);
	await octokit.request(ASSIGNEE, {
		owner: pr.owner,
		repo: pr.repo,
		issue_number: newPr.data.number,
		assignees: [pr.assignee],
	});

	log.log(`Adding reviewer to pull request ${newPr.data.number}`);
	await octokit.request(REVIEWER, {
		owner: pr.owner,
		repo: pr.repo,
		pull_number: newPr.data.number,
		reviewers: pr.reviewers,
	});

	log.verbose(`Adding label to pull request ${newPr.data.number}`);
	await octokit.request(LABEL, {
		owner: pr.owner,
		repo: pr.repo,
		issue_number: newPr.data.number,
		labels: pr.labels,
	});

	return newPr.data.number;
}

// list commits on a pull request
export async function listCommitsPullRequest(
	pr: {
		token: string;
		owner: string;
		repo: string;
		title?: string;
		description?: string;
		prNumber: number;
		strategy?: "squash" | "merge" | undefined;
	},
	log?: CommandLogger,
): Promise<any> {
	const octokit = new Octokit({ auth: pr.token });
	const response = await octokit.request(
		"GET /repos/{owner}/{repo}/pulls/{pull_number}/commits",
		{
			owner: pr.owner,
			repo: pr.repo,
			pull_number: pr.prNumber,
		},
	);
	return response.data;
}

export async function mergePullRequest(
	pr: {
		token: string;
		owner: string;
		repo: string;
		title: string;
		description: string;
		prNumber: number;
		mergeStrategy: "squash" | "merge" | undefined;
	},
	log: CommandLogger,
): Promise<any> {
	const octokit = new Octokit({ auth: pr.token });
	try {
		const squash = await octokit.request(MERGE_PULL_REQUEST, {
			owner: pr.owner,
			repo: pr.repo,
			pull_number: pr.prNumber,
			commit_title: pr.title,
			commit_message: pr.description,
			merge_method: pr.mergeStrategy,
		});
		log.log(`Squashed pull request`);
		return squash.status;
	} catch (error: any) {
		log.log(`Error: ${JSON.stringify(error.response.data.message)}`);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return error.status;
	}
}

export async function getPullRequestInfo(
	pr: {
		token: string;
		owner: string;
		repo: string;
		title?: string;
		description?: string;
		prNumber: number;
		strategy?: "squash" | "merge" | undefined;
	},
	log: CommandLogger,
): Promise<any> {
	const octokit = new Octokit({ auth: pr.token });
	const response = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
		owner: pr.owner,
		repo: pr.repo,
		pull_number: pr.prNumber,
	});
	log.log("Fetched pull request");
	return response;
}

export async function createComment(
	pr: {
		token: string;
		owner: string;
		repo: string;
		prNumber: number;
		comment: string;
	},
	log?: CommandLogger,
): Promise<any> {
	const octokit = new Octokit({
		auth: pr.token,
	});

	const response = await octokit.request(
		"POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
		{
			owner: pr.owner,
			repo: pr.repo,
			issue_number: pr.prNumber,
			body: pr.comment,
		},
	);

	log?.log(`PR comment created`);
	return response;
}
