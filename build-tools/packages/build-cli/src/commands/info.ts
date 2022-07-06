/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isMonoRepoKind, MonoRepoKind } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import { table } from "table";
import { BaseCommand } from "../base";
import { releaseGroupFlag } from "../flags";

/**
 * The root `info` command.
 */
export default class InfoCommand extends BaseCommand {
    static description = "Get info about the repo, release groups, and packages.";

    static flags = {
        ...super.flags,
        releaseGroup: releaseGroupFlag({
            required: false,
        }),
        private: Flags.boolean({
            char: "p",
            default: true,
            required: false,
            description: "Include private packages (default true).",
            allowNo: true,
        }),
    };

    static args = [];

    async run(): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { args, flags } = await this.parse(InfoCommand);
        const context = await this.getContext();
        let packages = [...context.fullPackageMap.values()];

        if (flags.releaseGroup !== undefined && isMonoRepoKind(flags.releaseGroup)) {
            packages = context.packagesForReleaseGroup(flags.releaseGroup);
        }

        if(!flags.private) {
            packages = packages.filter((p) => !p.packageJson.private);
        }

        const data: (string | MonoRepoKind | undefined)[][] = [
            ["Release group", "Name", "Private", "Version"],
        ];
        for (const pkg of packages) {
            data.push([
                pkg.monoRepo?.kind ?? "n/a",
                pkg.name,
                pkg.packageJson.private ? "-private-" : "",
                pkg.monoRepo ? pkg.monoRepo.version : pkg.version,
            ]);
        }

        const output = table(data, {
            columns: [{ alignment: "left" }, { alignment: "left" }, { alignment: "center" }],
            singleLine: true,
        });

        this.log(`\n${output}`);
        this.log(`Total package count: ${packages.length}`);
    }
}
