/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable camelcase */
import { Octokit } from "@octokit/core";

const OWNER = "microsoft";
const REPO_NAME = "FluidFramework";
const PULL_REQUEST_EXISTS = "GET /repos/{owner}/{repo}/pulls";
const PULL_REQUEST_INFO = "GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls";
const PULL_REQUEST = "POST /repos/{owner}/{repo}/pulls";
const ASSIGNEE = "POST /repos/{owner}/{repo}/issues/{issue_number}/assignees";
const REVIEWER = "POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers";
const LABEL = "POST /repos/{owner}/{repo}/issues/{issue_number}/labels";

const DESCRIPTION = `
        ## Main-next integrate PR
        The aim of this pull request is to sync main and next branch. The expectation from the assignee is as follows:
        > - Acknowledge the pull request by adding a comment -- "Actively working on it".
        > - Resolve any merge conflicts between this branch and next (and push the resolution to this branch). Merge next into this branch if needed. **Do NOT rebase or squash this branch: its history must be preserved**.
        > - Ensure CI is passing for this PR, fixing any issues. Please don't look into resolving **Real service e2e test** and **Stress test** failures as they are **non-required** CI failures.
        For more information about how to resolve merge conflicts and CI failures, visit [this wiki page](https://github.com/microsoft/FluidFramework/wiki/Main-next-Automation).`;
const TITLE = "Automate: Main Next Integrate";

/**
 *
 * @param token - GitHub authentication token
 * @returns Returns true if pull request exists
 */
export async function pullRequestExists(token: string): Promise<boolean> {
    const octokit = new Octokit({ auth: token });
    const response = await octokit.request(PULL_REQUEST_EXISTS, { owner: OWNER, repo: REPO_NAME });

    return response.data.some((d) => d.title === TITLE);
}

/**
 *
 * @param token - GitHub authentication token
 * @param commit_sha - Commit id for which we need pull request information
 */
export async function pullRequestInfo(token: string, commit_sha: string): Promise<any> {
    const octokit = new Octokit({ auth: token });
    const prInfo = await octokit.request(PULL_REQUEST_INFO, {
        owner: OWNER,
        repo: REPO_NAME,
        commit_sha,
    });

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
    auth: string,
    source: string,
    target: string,
    author: string,
): Promise<any> {
    const octokit = new Octokit({ auth });
    const newPr = await octokit.request(PULL_REQUEST, {
        owner: OWNER,
        repo: REPO_NAME,
        title: TITLE,
        body: DESCRIPTION,
        head: source,
        base: target,
    });

    await octokit.request(ASSIGNEE, {
        owner: OWNER,
        repo: REPO_NAME,
        issue_number: newPr.data.number,
        assignees: [author],
    });

    await octokit.request(REVIEWER, {
        owner: OWNER,
        repo: REPO_NAME,
        pull_number: newPr.data.number,
        reviewer: [],
    });

    await octokit.request(LABEL, {
        owner: OWNER,
        repo: REPO_NAME,
        issue_number: newPr.data.number,
        labels: ["main-next-integrate", "do-not-squash-merge"],
    });

    return newPr.data.number;
}
