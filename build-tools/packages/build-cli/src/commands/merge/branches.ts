/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import { BaseCommand } from "../../base";
import * as api from "../../api";

/**
 * This command class is used to merge two branches based on the batch size provided.
 * It looks for the last common commit between two branches and computes the remaining commits to be merged.
 * Later, it creates a pull request based on the batch size passed.
 */
export default class MergeBranch extends BaseCommand<typeof MergeBranch.flags> {
    static description = "Sync branches depending on the batch size passed";

    static flags = {
        auth: Flags.string({
            description: "GitHub authentication token",
            char: "a",
            required: true,
        }),
        source: Flags.string({
            description: "Source branch name",
            char: "s",
            required: true,
        }),
        target: Flags.string({
            description: "Target branch name",
            char: "t",
            required: true,
        }),
        batchSize: Flags.integer({
            description: "Maximum number of commits to include in the pull request",
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

        const context = await this.getContext();
        const gitRepo = context.gitRepo;
        const prExists: boolean = await api.pullRequestExists(flags.auth);

        if (prExists) {
            this.warn(`Open pull request exists`);
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

            if (str.length > 40) {
                this.error(
                    `Unexpected string. Incorrect commit id length. Please check the commit id`,
                );
            }
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
        while (i !== commitSize) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await gitRepo.merge(unmergedCommitList[i]);
            } catch (error: unknown) {
                this.error(`Merge abort for ${unmergedCommitList[i]}: ${error}`);
                break;
            }

            commit = i;
            i++;
        }

        let prNumber;
        if (i === 0) {
            this.log(
                `Opening a pull request for a single commit (${unmergedCommitList[0]}) because it are merge conflicts with the ${flags.target} branch.`,
            );
            await gitRepo.deleteBranch(branchName);
            await gitRepo.switchBranch(flags.source);
            await gitRepo.createBranch(`${flags.source}-${flags.target}-${unmergedCommitList[0]}`);
            await gitRepo.fetchBranch(
                flags.source,
                `${flags.source}-${flags.target}-${unmergedCommitList[0]}`,
            );
            await gitRepo.setUpstream(`${flags.source}-${flags.target}-${unmergedCommitList[0]}`);
            await gitRepo.resetBranch(unmergedCommitList[0]);
            // fetch name of owner associated to the pull request
            const data = await api.pullRequestInfo(flags.auth, unmergedCommitList[0]);
            this.log(`Fetch pull request info for commit id ${unmergedCommitList[0]}: ${data}`);
            prNumber = await api.createPullRequest(
                flags.auth,
                `${flags.source}-${flags.target}-${unmergedCommitList[0]}`,
                flags.target,
                "sonalivdeshpande",
            );
            this.log(
                `Open pull request for commit id ${unmergedCommitList[0]}. Please resolve the merge conflicts.`,
            );
        } else {
            // fetch name of owner associated to the pull request
            const data = await api.pullRequestInfo(flags.auth, unmergedCommitList[commit]);
            this.info(
                `Fetch pull request info for commit id ${unmergedCommitList[commit]}: ${data}`,
            );
            prNumber = await api.createPullRequest(
                flags.auth,
                branchName,
                flags.target,
                "sonalivdeshpande",
            );
            this.info(`Pull request opened for pushing bulk commits`);
        }

        this.log(
            `Pull request is opened against ${flags.target} with pull request number ${prNumber}`,
        );
    }
}
