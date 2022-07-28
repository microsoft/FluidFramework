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
            options: ["--server", "--azure", "--build-tools"],
            required: false,
            default: "--client",
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

        let kind = MonoRepoKind.Client;

        // https://oclif.io/docs/base_class
        switch (flags.monoRepoKind) {
            case "--server":
                if (flags.monoRepoKind === "--server") kind = MonoRepoKind.Server;
                break;

            case "--azure":
                if (flags.monoRepoKind === "--azure") kind = MonoRepoKind.Azure;
                break;

            case "--build-tools":
                if (flags.monoRepoKind === "--build-tools") kind = MonoRepoKind.BuildTools;
                break;
        }

        try {
            const releaseGroup = repo.monoRepos.get(kind);
            if (releaseGroup === undefined) {
                this.error(`release group couldn't be found.`);
            }

            await generateMonoRepoInstallPackageJson(releaseGroup);
        } catch (error_: unknown) {
            this.error(error_ as string);
        }
    }
}
