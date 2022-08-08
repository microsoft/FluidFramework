import { createBranch } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { BaseCommand } from "../base";

// const owner = 'microsoft';
// const repo = 'FluidFramework';
// const title = "Automation: Main Next Integrate";

async function listLabels(token: string) {
    // const octokit = new Octokit({ auth: token });
    // await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/labels', {
    //     owner: owner,
    //     repo: repo,
    //     issue_number: 'ISSUE_NUMBER'
    // })
}

async function addLabel(token: string, issueNumber: number, labels: string[]) {
    // const octokit = new Octokit({ auth: token });
    // await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
    //     owner: owner,
    //     repo: repo,
    //     issue_number: issue_number,
    //     labels: labels,
    // });
    // labels: [
    //     'main-next-integrate',
    //     'do-not-squash-merge'
    // ]
}

async function prExists(token?: string, title?: string): Promise<boolean> {
    // const octokit = new Octokit({ auth: token });
    // const response = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
    //     owner: owner,
    //     repo: repo
    // });

    // for(let i=0; i<response.data.length; i++) {
    //     if(response.data[i].title === title) {
    //         return true;
    //     }
    // }

    return false;
}

async function prInfo(commitSha: string) {
    // const octokit = new Octokit({ auth: token })
    //   await octokit.request('GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls', {
    //     owner: 'OWNER',
    //     repo: 'REPO',
    //     commit_sha: 'COMMIT_SHA'
    //   })
}

async function createPR(
    token: string,
    sha: string,
    sourceBranch: string,
    targetBranch: string,
    author: string,
    reviewers: string[],
) {
    // const description = `
    //     ## Main-next integrate PR
    //     The aim of this pull request is to sync main and next branch. The expectation from the assignee is as follows:
    //     > - Acknowledge the pull request by adding a comment -- "Actively working on it".
    //     > - Resolve any merge conflicts between this branch and next (and push the resolution to this branch). Merge next into this branch if needed. **Do NOT rebase or squash this branch: its history must be preserved**.
    //     > - Ensure CI is passing for this PR, fixing any issues. Please don't look into resolving **Real service e2e test** and **Stress test** failures as they are **non-required** CI failures.
    //     For more information about how to resolve merge conflicts and CI failures, visit [this wiki page](https://github.com/microsoft/FluidFramework/wiki/Main-next-Automation).`;
    // const octokit = new Octokit({ auth: token })
    // const newPr = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
    //     owner: owner,
    //     repo: repo,
    //     title: title,
    //     body: description,
    //     head: sourceBranch,
    //     base: targetBranch,
    // });
    // await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/assignees', {
    //     owner: owner,
    //     repo: repo,
    //     issue_number: newPr.data.number,
    //     assignees: [ author ]
    // });
    // await octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers', {
    //     owner: owner,
    //     repo: repo,
    //     pull_number: newPr.data.number,
    //     reviewers: reviewers,
    // });
}

export default class Merge extends BaseCommand<typeof BaseCommand.flags> {
    static description = "describe the command here";

    static examples = ["<%= config.bin %> <%= command.id %>"];

    static flags = {
        githubToken: Flags.string({
            description: "",
            required: true,
        }),
        source: Flags.string({
            description: "",
            default: "main",
            required: false,
        }),
        target: Flags.string({
            description: "",
            default: "next",
            required: false,
        }),
        batchSize: Flags.integer({
            description: "",
            default: 1,
            required: false,
        }),
        ...BaseCommand.flags,
    };

    static args = [{ name: "file" }];

    public async run(): Promise<void> {
        const { args, flags } = await this.parse(Merge);

        // check if PR exists
        if (await prExists()) {
            this.exit(-1);
        }

        const lastMergedCommit = await mergeBase(flags.source, flags.target);
        const nextHead = await switchBranch(flags.target);
        const unmergedCommits = await revList(lastMergedCommit, nextHead);
        this.log("unmerged commit------", unmergedCommits);

        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < unmergedCommits.length; i++) {
            // check if commits equal to specific bacth size exists
        }

        const commitInfo = await prInfo(unmergedCommits); // iterate and get the last commit
        this.log("commit info----", commitInfo);

        // create-branch
        createBranch("branchName");

        // pull-request
        const pullRequest = await createPR("", "", "branchName", flags.target, "", []);

        if (pullRequest === undefined) {
            this.error("Unable to create pull request");
            // notify the process owner
        }
    }
}
