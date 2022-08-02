/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    generateMonoRepoInstallPackageJson,
    isMonoRepoKind,
    Timer,
} from "@fluidframework/build-tools";
import { BaseCommand } from "../../base";
import { releaseGroupFlag } from "../../flags";

export class GeneratePackageJson extends BaseCommand<typeof GeneratePackageJson.flags> {
    static description = `Generate mono repo package json`;

    static flags = {
        releaseGroup: releaseGroupFlag({ required: true }),
        ...BaseCommand.flags,
    };

    async run() {
        const { flags } = await this.parse(GeneratePackageJson);
        const timer = new Timer(flags.timer);

        const context = await this.getContext();

        // Load the package
        const repo = context.repo;
        timer.time("Package scan completed");

        let releaseGroup;

        if (typeof flags.releaseGroup === "string" && isMonoRepoKind(flags.releaseGroup)) {
            releaseGroup = repo.monoRepos.get(flags.releaseGroup) ?? undefined;

            if (releaseGroup === undefined) {
                this.error(`release group couldn't be found.`);
            }

            await generateMonoRepoInstallPackageJson(releaseGroup);
        }

        this.error(`release group is not mono repo kind.`);
    }
}
