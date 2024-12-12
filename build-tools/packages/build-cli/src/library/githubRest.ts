/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Octokit } from "@octokit/rest";

/**
 * Common properties used when connecting to GitHub APIs.
 */
export interface GitHubProps {
	/**
	 * The owner of the repo.
	 */
	owner: string;

	/**
	 * The name of the repo.
	 */
	repo: string;

	/**
	 * A GitHub access token.
	 *
	 * @remarks
	 * This token should be treated as any other secure/secret value. Do not log it, do not include it in source code,
	 * and do not copy/paste it into insecure inputs.
	 */
	token: string;
}

/**
 * Returns an array of GitHub usernames that have approved a PR.
 */
export async function getPrApprovers(
	{ owner, repo, token }: GitHubProps,
	prNumber: number,
): Promise<string[]> {
	const octokit = new Octokit({ auth: token });

	// Fetch PR reviews
	const { data } = await octokit.pulls.listReviews({
		owner,
		repo,
		pull_number: prNumber,
	});

	const approvers = data
		.filter(
			(review) =>
				review.state === "APPROVED" &&
				// It's not clear when the user is null, but we need to exclude such reviews since the whole point of this
				// function is to get a list of users that approved the PR.
				review.user !== null,
		)
		.map((review) => review.user?.login)
		.filter((user): user is string => user !== undefined);

	return approvers;
}

/**
 * Check if a GitHub PR is approved by a member of a GitHub team.
 *
 * @param github - Details about the GitHub repo and auth to use.
 * @param prNumber - Pull request number.
 * @param teamName - The team whose membership should be checked. The team must be in the same GitHub organization as
 * the repo. Only the team name should be provided - the org is inferred from the repo details.
 *
 * @returns `true` if at least one of the users on the team has approved the PR; `false` otherwise.
 */
export async function isPrApprovedByTeam(
	github: GitHubProps,
	prNumber: number,
	teamName: string,
): Promise<boolean> {
	const octokit = new Octokit({ auth: github.token });

	// Fetch team members
	const { data: teamMembers } = await octokit.teams.listMembersInOrg({
		org: github.owner,
		team_slug: teamName,
	});

	// Extract team member logins
	const teamMemberLogins = new Set(teamMembers.map((member) => member.login));

	return isPrApprovedByUsers(github, prNumber, teamMemberLogins);
}

/**
 * Check if a GitHub PR is approved by someone in a list of users.
 *
 * @param github - Details about the GitHub repo and auth to use.
 * @param prNumber - Pull request number.
 * @param approvers - GitHub users who should be considered approvers.
 *
 * @returns `true` if at least one of the approvers has approved the PR; `false` otherwise.
 */
export async function isPrApprovedByUsers(
	github: GitHubProps,
	prNumber: number,
	approvers: Set<string>,
): Promise<boolean> {
	// Get the users who approved the PR
	const reviewers = await getPrApprovers(github, prNumber);

	// Check if any review is approved by an approver. If at least one of the reviewers is an approver, it's considered
	// approved.
	const approved = reviewers.some((user) => approvers.has(user));
	return approved;
}

/**
 * Creates or modifies a single review comment on a PR. The comment is identified with a unique identifier, so the same comment is updated on repeated calls.
 *
 * @param github - Details about the GitHub repo and auth to use.
 * @param prNumber - Pull request number.
 * @param body - review comment body to be posted.
 * @param commentIdentifier - unique identifier for the comment to be updated.
 *
 * @returns id of the comment that was updated.
 */
export async function createOrUpdateCommentOnPr(
	{ owner, repo, token }: GitHubProps,
	prNumber: number,
	body: string,
	commentIdentifier: string,
): Promise<number> {
	const octokit = new Octokit({ auth: token });

	// List of review comments for the pull request
	const { data: comments } = await octokit.pulls.listReviews({
		owner,
		repo,
		pull_number: prNumber,
	});

	let commentId: number | undefined;
	// Log the comments to find the comment_id
	for (const comment of comments) {
		if (comment.body.startsWith(commentIdentifier)) {
			commentId = comment.id;
			break;
		}
	}

	if (commentId === undefined) {
		const response = await octokit.pulls.createReview({
			owner,
			repo,
			pull_number: prNumber,
			event: "COMMENT",
			body,
		});
		return response.data.id;
	}
	// Update PR review comment
	const { data } = await octokit.pulls.updateReview({
		owner,
		repo,
		pull_number: prNumber,
		body,
		review_id: commentId,
	});
	return data.id;
}

/**
 * Retrieves body of the comment if commentIdentifier identifies the comment.
 *
 * @param github - Details about the GitHub repo and auth to use.
 * @param prNumber - Pull request number.
 * @param commentIdentifier - unique identifier for the comment to be updated.
 *
 * @returns body of the comment identified by commentIdentifier.
 */
export async function getCommentBody(
	{ owner, repo, token }: GitHubProps,
	prNumber: number,
	commentIdentifier: string,
): Promise<string | undefined> {
	const octokit = new Octokit({ auth: token });

	// List of review comments for the pull request
	const { data: comments } = await octokit.pulls.listReviews({
		owner,
		repo,
		pull_number: prNumber,
	});

	let commentBody: string | undefined;
	// Check the comments to find the comment with the identifier.
	for (const comment of comments) {
		if (comment.body.startsWith(commentIdentifier)) {
			return comment.body;
		}
	}
	return undefined;
}

/**
 * Api to get the changed file paths in a PR. The paths are relative to the root of the repo.
 * @param github - Details about the GitHub repo and auth to use.
 * @param prNumber - Pr number for which the changed files paths are to be fetched
 * @returns - List of file paths that are changed in the PR
 */
export async function getChangedFilePaths(
	{ owner, repo, token }: GitHubProps,
	prNumber: number,
): Promise<string[]> {
	const octokit = new Octokit({ auth: token });

	// List of files changed in the pull request
	const { data: files } = await octokit.pulls.listFiles({
		owner,
		repo,
		pull_number: prNumber,
	});
	const fileNames = files.map((file) => file.filename);
	return fileNames;
}
