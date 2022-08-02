const { Octokit } = require("@octokit/core");
const owner = "microsoft";
const repo = "FluidFramework";
const title = "Automation: Main Next Integrate";

export async function prExists(token: string) {
    const octokit = new Octokit({ auth: token });
    const response = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
        owner: owner,
        repo: repo
    });
    for(let i=0; i<response.data.length; i++) {
        if(response.data[i].title === title) {
            return true;
        }
    }
    return false;
}

export async function createPR(token: string, sha: string, sourceBranch: string, targetBranch: string, author: string, reviewers: string[]) {
    const description = `
        ## Main-next integrate PR

        The aim of this pull request is to sync main and next branch. The expectation from the assignee is as follows:

        > - Acknowledge the pull request by adding a comment -- "Actively working on it".
        > - Resolve any merge conflicts between this branch and next (and push the resolution to this branch). Merge next into this branch if needed. **Do NOT rebase or squash this branch: its history must be preserved**.
        > - Ensure CI is passing for this PR, fixing any issues. Please don't look into resolving **Real service e2e test** and **Stress test** failures as they are **non-required** CI failures.

        For more information about how to resolve merge conflicts and CI failures, visit [this wiki page](https://github.com/microsoft/FluidFramework/wiki/Main-next-Automation).`;

    const octokit = new Octokit({ auth: token })
    const newPr = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
        owner: owner,
        repo: repo,
        title: title,
        body: description,
        head: sourceBranch,
        base: targetBranch,
    });

    await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/assignees', {
        owner: owner,
        repo: repo,
        issue_number: newPr.data.number,
        assignees: [ author ]
    });

    await octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers', {
        owner: owner,
        repo: repo,
        pull_number: newPr.data.number,
        reviewers: reviewers,
    });
}
