/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isMonoRepoKind, MonoRepoKind, Package } from "@fluidframework/build-tools";
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
            allowNo: true,
            char: "p",
            default: true,
            description: "Include private packages (default true).",
            required: false,
        }),
    };

    static args = [];

    async run(): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { args, flags } = await this.parse(InfoCommand);
        const context = await this.getContext(flags.verbose);
        let packages =
            flags.releaseGroup !== undefined && isMonoRepoKind(flags.releaseGroup)
                ? context.packagesForReleaseGroup(flags.releaseGroup)
                : [...context.fullPackageMap.values()];

        // Filter out private packages
        if (!flags.private) {
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
