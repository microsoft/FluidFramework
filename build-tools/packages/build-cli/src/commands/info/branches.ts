/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import chalk from "chalk";

import { BaseCommand } from "../../base";
import { Repository, parseReleaseBranchName, indentString } from "../../lib";

export default class InfoBranchesCommand extends BaseCommand<typeof InfoBranchesCommand.flags> {
    static description = "Get info about the official branches in the repo.";

    static flags = {
        // branch: Flags.string({
        //     char: "b",
        //     description: "A branch name. Use this argument multiple times to provide multiple branch names.",
        //     multiple: true,
        // }),
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
        // const branchFlags = flags.branch;

        const context = await this.getContext();
        const repo = new Repository(context.gitRepo.resolvedRoot);
        const remote = await repo.getRemote(context.originRemotePartialUrl);

        if (remote === undefined) {
            this.error(`Can't find a remote with ${context.originRemotePartialUrl}`);
        }
        this.verbose(`Remote is: ${remote}`);

        const branchLogs: string[] = [];
        const releaseBranches = await repo.gitClient
            .fetch()
            .branch(["--all", "--list", `${remote}/release/*`]);

        const data = new Map<string, any[]>();

        for (const br of Object.values(releaseBranches.branches)) {
            const [name, rg, ver] = parseReleaseBranchName(br.name);
            if(!data.has(rg)){
                data.set(rg, []);
            }
            data.get(rg)?.push(`${name}: ${chalk.blue(ver.version)} (${br.commit})`)
        }

        this.logHr();
        this.log(`Release branches:`);
        for(const [rg, branches] of data.entries()) {
            branchLogs.push(chalk.bold(rg));
            for(const branch of branches) {
                branchLogs.push(indentString(branch));
            }
            branchLogs.push("");
        }
        this.log(branchLogs.join("\n"));
        this.log();
    }
}
