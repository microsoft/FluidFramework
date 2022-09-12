/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { getResolvedFluidRoot, GitRepo } from "@fluidframework/build-tools";
import { Octokit } from "@octokit/core";
import { Flags } from "@oclif/core";
import { BaseCommand } from "../../base";

async function prExists(token: string, title: string): Promise<boolean> {
    const owner = "microsoft";
    const repo = "FluidFramework";
    const octokit = new Octokit({ auth: token });
    const response = await octokit.request("GET /repos/{owner}/{repo}/pulls", { owner, repo });

    for (const data of response.data) {
        if (data.title === title) {
            return true;
        }
    }

    return false;
}

async function prInfo(token: string, commitSha: string) {
    const owner = "microsoft";
    const repo = "FluidFramework";
    const octokit = new Octokit({ auth: token });
    await octokit.request("GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls", {
        owner,
        repo,
        commitSha,
    });
}

async function createPR(auth: string, source: string, target: string, author: string) {
    const owner = "microsoft";
    const repo = "FluidFramework";
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
        // eslint-disable-next-line camelcase
        issue_number: newPr.data.number,
        assignees: [author],
    });

    await octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers", {
        owner,
        repo,
        // eslint-disable-next-line camelcase
        pull_number: newPr.data.number,
        reviewer: [],
    });

    await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/labels", {
        owner,
        repo,
        // eslint-disable-next-line camelcase
        issue_number: newPr.data.number,
        labels: ["main-next-integrate", "do-not-squash-merge"],
    });

    return newPr.data.number;
}

export default class MergeBranch extends BaseCommand<typeof MergeBranch.flags> {
    static description = "Sync branches depending on the batch size passed";

    static examples = ["<%= config.bin %> <%= command.id %>"];

    static flags = {
        auth: Flags.string({
            description: "GitHub authentication token",
            char: "a",
            required: true,
        }),
        source: Flags.string({
            description: "Source branch",
            char: "s",
            required: true,
        }),
        target: Flags.string({
            description: "Target branch",
            char: "t",
            required: true,
        }),
        batchSize: Flags.integer({
            description: "Maximum number of commit to include in the pull request",
            char: "b",
            required: true,
        }),
        pullRequestInfo: Flags.string({
            description: "Pull request data",
            char: "p",
            multiple: true,
        }),
        ...BaseCommand.flags,
    };

    public async run(): Promise<void> {
        const flags = this.processedFlags;

        const resolvedRoot = await getResolvedFluidRoot();
        const gitRepo = new GitRepo(resolvedRoot);

        if (await prExists(flags.auth, "Automation: Main-next integrate")) {
            this.log(`Open pull request exists`);
            this.exit(-1);
        }

        const lastMergedCommit = await gitRepo.mergeBase(flags.source, flags.target);
        this.log(
            `${lastMergedCommit} is the last merged commit id between ${flags.source} and ${flags.target}`,
        );

        const listCommits = await gitRepo.revList(lastMergedCommit, flags.source);
        const unmergedCommitList: string[] = [];
        let str = "";

        for (const id of listCommits) {
            // check the length to be 40 since git commit id is 40 digits long
            if (str.length === 40) {
                unmergedCommitList.push(str);
                str = "";
                continue;
            }

            str += id;
        }

        this.log(
            `There are ${unmergedCommitList.length} unmerged commits between ${flags.source} and ${flags.target} branches`,
        );

        if (unmergedCommitList.length === 0) {
            this.log(
                `${flags.source} and ${flags.target} branches are in sync. No commits to merge`,
            );
            this.exit(-1);
        }

        const commitSize =
            flags.batchSize <= unmergedCommitList.length
                ? flags.batchSize
                : unmergedCommitList.length;
        const commitToReset = unmergedCommitList[commitSize - 1];
        const branchName = `${flags.source}-${flags.target}-${commitToReset}`;

        await gitRepo.switchBranch(flags.target);
        await gitRepo.createBranch(branchName);
        await gitRepo.fetchBranch(flags.target, branchName);
        await gitRepo.setUpstream(branchName);

        // passed a set of commit ids, return the commit id upto which the branch should get reset to
        let i = 0;
        let commit = 0;
        while(i !== commitSize) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await gitRepo.merge(unmergedCommitList[i]);
            } catch (error: unknown) {
                // eslint-disable-next-line no-await-in-loop
                await gitRepo.mergeAbort();
                this.log(`Merge abort for ${unmergedCommitList[i]}: `, error);
                break;
            }

            commit = i;
            i++;
        }

        let prNumber;
        if(i === 0) {
            this.log(`Opening a pull request for a single commit id ${unmergedCommitList[0]} as it might have merge conflicts with the ${flags.target} branch.`);
            await gitRepo.switchBranch(flags.source);
            await gitRepo.createBranch(`${flags.source}-${flags.target}-${unmergedCommitList[0]}`);
            await gitRepo.fetchBranch(flags.source, `${flags.source}-${flags.target}-${unmergedCommitList[0]}`);
            await gitRepo.setUpstream(`${flags.source}-${flags.target}-${unmergedCommitList[0]}`);
            await gitRepo.resetBranch(unmergedCommitList[0]);
            prNumber = await createPR(flags.auth, `${flags.source}-${flags.target}-${unmergedCommitList[0]}`, flags.target, "sonalivdeshpande");
            // fetch name of owner associated to the pull request
            const data = await prInfo(flags.auth, unmergedCommitList[0]);
            this.log(`Fetch pull request info for commit id ${unmergedCommitList[0]}: ${data}`);
            this.log(`Open pull request for commit id ${unmergedCommitList[0]}. Please resolve the merge conflicts.`);
        } else {
            prNumber = await createPR(flags.auth, branchName, flags.target, "sonalivdeshpande");
            // fetch name of owner associated to the pull request
            const data = await prInfo(flags.auth, unmergedCommitList[commit]);
            this.log(`Fetch pull request info for commit id ${unmergedCommitList[commit]}: ${data}`);
            this.log(`Pull request opened for pushing bulk commits`);
        }

        this.log(
            `Pull request is opened against ${flags.target} with pull request number ${prNumber}`,
        );
    }
}
