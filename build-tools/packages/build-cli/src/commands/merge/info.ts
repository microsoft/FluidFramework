/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import chalk from "chalk";

import { BaseCommand } from "../../base";
import { Repository } from "../../lib";

export default class MergeInfoCommand extends BaseCommand<typeof MergeInfoCommand.flags> {
    static description = "Get info about the merge status of branches in the repo.";

    static aliases = ["check:main-next"];

    static flags = {
        branch: Flags.string({
            char: "b",
            description:
                "A branch name. Use this argument multiple times to provide multiple branch names.",
            multiple: true,
        }),
        ...BaseCommand.flags,
    };

    static examples = [
        {
            description: "Get info about branches in the repo.",
            command: "<%= config.bin %> <%= command.id %>",
        },
    ];

    public async run(): Promise<void> {
        const args = this.processedArgs;
        const flags = this.processedFlags;
        const branchFlags = flags.branch;

        let branch1: string;
        let branch2: string;

        // Default to main and next
        if (branchFlags === undefined || branchFlags.length === 0) {
            [branch1, branch2] = ["main", "next"];
        } else if (branchFlags.length === 1) {
            [branch1, branch2] = [branchFlags[0], "next"];
        } else {
            [branch1, branch2] = branchFlags;
        }

        const context = await this.getContext();
        const repo = new Repository(context.gitRepo.resolvedRoot);
        const remote = await repo.getRemote(context.originRemotePartialUrl);

        if (remote === undefined) {
            this.error(`Can't find a remote with ${context.originRemotePartialUrl}`);
        }
        this.verbose(`Remote is: ${remote}`);

        // get merge base
        const base = await repo.gitClient
            .fetch() // make sure we have the latest remote refs
            .raw(
                "merge-base",
                `refs/remotes/${remote}/${branch1}`,
                `refs/remotes/${remote}/${branch2}`,
            );

        const rawRevs = await repo.gitClient.raw(
            "rev-list",
            `${base}..refs/remotes/${remote}/${branch1}`,
        );

        const revs = rawRevs.split(/\r?\n/);

        this.logHr();
        this.log(`${branch2} is ${revs.length} commits ${chalk.red("behind")} ${branch1}`);
        this.log();
        this.verbose(JSON.stringify(revs.slice(0, 10)));
    }
}
