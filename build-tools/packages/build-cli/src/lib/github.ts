/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Octokit } from "@octokit/core";
import { CommandLogger } from "../logging";

const OWNER = "microsoft";
const REPO_NAME = "FluidFramework";
const PULL_REQUEST_EXISTS = "GET /repos/{owner}/{repo}/pulls";
const PULL_REQUEST_INFO = "GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls";
const PULL_REQUEST = "POST /repos/{owner}/{repo}/pulls";
const ASSIGNEE = "POST /repos/{owner}/{repo}/issues/{issue_number}/assignees";
const REVIEWER = "POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers";
const LABEL = "POST /repos/{owner}/{repo}/issues/{issue_number}/labels";
const GET_USER = "GET /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/users";

/**
 *
 * @param token - GitHub authentication token
 * @returns Returns true if pull request exists
 */
export async function pullRequestExists(
	token: string,
	title: string,
	log: CommandLogger,
): Promise<boolean> {
	log.verbose("Checking if pull request exists----------------");
	const octokit = new Octokit({ auth: token });
	const response = await octokit.request(PULL_REQUEST_EXISTS, { owner: OWNER, repo: REPO_NAME });

	return response.data.some((d) => d.title === title);
}

/**
 *
 * @param token - GitHub authentication token
 * @param commit_sha - Commit id for which we need pull request information
 */
export async function pullRequestInfo(
	token: string,
	commit_sha: string,
	log: CommandLogger,
): Promise<any> {
	const octokit = new Octokit({ auth: token });
	const prInfo = await octokit.request(PULL_REQUEST_INFO, {
		owner: OWNER,
		repo: REPO_NAME,
		commit_sha,
	});

	log.verbose(`Get pull request info for ${commit_sha}: ${JSON.stringify(prInfo)}`);
	return prInfo;
}

/**
 *
 * @param token - GitHub authentication token
 * @returns Lists the user who have push access to this branch
 */
export async function getUserAccess(token: string, log: CommandLogger): Promise<any> {
	const octokit = new Octokit({ auth: token });

	const user = await octokit.request(GET_USER, {
		owner: OWNER,
		repo: REPO_NAME,
		branch: "main",
	});

	log.verbose(`Get list of users with push access ${JSON.stringify(user)}`);
	return user;
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
		source: string;
		target: string;
		assignee: string;
		title: string;
		description: string;
	},
	log: CommandLogger,
): Promise<any> {
	log.verbose(`Creating a pull request---------------`);
	const octokit = new Octokit({ auth: pr.token });
	const newPr = await octokit.request(PULL_REQUEST, {
		owner: OWNER,
		repo: REPO_NAME,
		title: pr.title,
		body: pr.description,
		head: pr.source,
		base: pr.target,
	});

	log.verbose(`Assigning ${pr.assignee} to pull request ${newPr.data.number}`);
	await octokit.request(ASSIGNEE, {
		owner: OWNER,
		repo: REPO_NAME,
		issue_number: newPr.data.number,
		assignees: [pr.assignee],
	});

	log.verbose(`Adding reviewer to pull request ${newPr.data.number}`);
	await octokit.request(REVIEWER, {
		owner: OWNER,
		repo: REPO_NAME,
		pull_number: newPr.data.number,
		reviewer: [],
	});

	log.verbose(`Adding label to pull request ${newPr.data.number}`);
	await octokit.request(LABEL, {
		owner: OWNER,
		repo: REPO_NAME,
		issue_number: newPr.data.number,
		labels: ["main-next-integrate", "do-not-squash-merge"],
	});

	return newPr.data.number;
}
