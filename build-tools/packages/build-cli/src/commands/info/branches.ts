/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";

import { BaseCommand } from "../../base";
import { Repository } from "../../lib";

export default class InfoBranchesCommand extends BaseCommand<typeof InfoBranchesCommand.flags> {
    static description = "Get info about the branches in the repo.";

    static aliases = ["check:main-next"];

    static flags = {
        branch: Flags.string({
            char: "b",
            description: "A branch name.",
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

    /**
     * Runs the `bump deps` command.
     */
    public async run(): Promise<void> {
        const args = this.processedArgs;
        const flags = this.processedFlags;
        const branchFlags = this.processedFlags.branch;

        let branch1: string;
        let branch2: string;

        let b1 = branchFlags === undefined ? "main" : branchFlags[0];

        let [b1, b2] = branchFlags === undefined ? ["main", "next"] : branchFlags

        if(branchFlags === undefined || branchFlags.length === 0) {
            [branch1, branch2] = ["main", "next"];
        } else if (branchFlags.length === 1) {
            [branch1, branch2] = [branchFlags[0], "next"];
        } else {
            [branch1, branch2] = branchFlags;
        }

        const context = await this.getContext();
        const repo = new Repository(context.gitRepo.resolvedRoot);
        const remote = await repo.getRemote(context.originRemotePartialUrl);

        this.info(`Remote is: ${remote}`);

        if (remote === undefined) {
            this.error(`Can't find a remote with ${context.originRemotePartialUrl}`);
        }

        // get merge base
        const base = await repo.gitClient
            .fetch() // make sure we have the latest remote refs
            .raw("merge-base", `refs/remotes/${remote}/${b1}`, `refs/remotes/${remote}/${b2}`);

        const rawRevs = await repo.gitClient.raw(
            "rev-list",
            `${base}..refs/remotes/${remote}/${b1}`,
        );

        const revs = rawRevs.split(/\r?\n/);

        this.logHr();
        this.log(`${b2} is ${revs.length} commits behind ${b1}`);
        this.log();
        this.log(JSON.stringify(revs.slice(0, 10)));
    }
}
