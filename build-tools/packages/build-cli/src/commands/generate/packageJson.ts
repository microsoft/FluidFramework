/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import {
    generateMonoRepoInstallPackageJson,
    MonoRepoKind,
    Timer,
} from "@fluidframework/build-tools";
import { BaseCommand } from "../../base";

export class GeneratePackageJson extends BaseCommand {
    static description = "describe the command here";

    static flags = {
        monoRepoKind: Flags.enum({
            description: `Generate package lock for specified (server/client/azure/build-tools) mono repo`,
            options: [MonoRepoKind.Server, MonoRepoKind.Azure, MonoRepoKind.BuildTools],
            required: false,
            default: MonoRepoKind.Client,
        }),
        ...super.flags,
    };

    async run() {
        const { flags } = await this.parse(GeneratePackageJson);
        const timer = new Timer(flags.timer);

        const context = await this.getContext(flags.verbose);

        // Load the package
        const repo = context.repo;
        timer.time("Package scan completed");

        try {
            const releaseGroup = repo.monoRepos.get(flags.monoRepoKind);
            if (releaseGroup === undefined) {
                this.error(`release group couldn't be found.`);
            }

            await generateMonoRepoInstallPackageJson(releaseGroup);
        } catch (error_: unknown) {
            this.error(error_ as string);
        }
    }
}
