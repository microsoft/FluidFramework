/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable camelcase */
import { Octokit } from "@octokit/core";

const owner = "microsoft";
const repo = "FluidFramework";

export async function pullRequestExists(token: string, title: string): Promise<boolean> {
    const octokit = new Octokit({ auth: token });
    const response = await octokit.request("GET /repos/{owner}/{repo}/pulls", { owner, repo });

    for (const data of response.data) {
        if (data.title === title) {
            return true;
        }
    }

    return false;
}

export async function pullRequestInfo(token: string, commit_sha: string) {
    const octokit = new Octokit({ auth: token });
    await octokit.request("GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls", {
        owner,
        repo,
        commit_sha,
    });
}

export async function createPullRequest(
    auth: string,
    source: string,
    target: string,
    author: string,
) {
    const description = `
        ## Main-next integrate PR
        The aim of this pull request is to sync main and next branch. The expectation from the assignee is as follows:
        > - Acknowledge the pull request by adding a comment -- "Actively working on it".
        > - Resolve any merge conflicts between this branch and next (and push the resolution to this branch). Merge next into this branch if needed. **Do NOT rebase or squash this branch: its history must be preserved**.
        > - Ensure CI is passing for this PR, fixing any issues. Please don't look into resolving **Real service e2e test** and **Stress test** failures as they are **non-required** CI failures.
        For more information about how to resolve merge conflicts and CI failures, visit [this wiki page](https://github.com/microsoft/FluidFramework/wiki/Main-next-Automation).`;
    const octokit = new Octokit({ auth });
    const newPr = await octokit.request("POST /repos/{owner}/{repo}/pulls", {
        owner,
        repo,
        title: "Automate: Main Next Integrate",
        body: description,
        head: source,
        base: target,
    });

    await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/assignees", {
        owner,
        repo,
        issue_number: newPr.data.number,
        assignees: [author],
    });

    await octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers", {
        owner,
        repo,
        pull_number: newPr.data.number,
        reviewer: [],
    });

    await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/labels", {
        owner,
        repo,
        issue_number: newPr.data.number,
        labels: ["main-next-integrate", "do-not-squash-merge"],
    });

    return newPr.data.number;
}
