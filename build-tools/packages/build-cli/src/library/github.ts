/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Octokit } from "@octokit/core";
import { CommandLogger } from "../logging.js";

const PULL_REQUEST_EXISTS = "GET /repos/{owner}/{repo}/pulls";
const COMMIT_INFO = "GET /repos/{owner}/{repo}/commits/{ref}";
const PULL_REQUEST = "POST /repos/{owner}/{repo}/pulls";
const ASSIGNEE = "POST /repos/{owner}/{repo}/issues/{issue_number}/assignees";
const LABEL = "POST /repos/{owner}/{repo}/issues/{issue_number}/labels";
const REVIEWER = "POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers";

/**
 * Check if a pull request exists.
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
 * Get commit info for a commit from GitHub.
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 * Create a pull request.
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
): Promise<number> {
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
