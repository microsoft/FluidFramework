/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";

import { Timer, generateMonoRepoInstallPackageJson } from "@fluidframework/build-tools";

import { BaseCommand } from "../../base";
import { releaseGroupFlag } from "../../flags";

export class GeneratePackageJson extends BaseCommand<typeof GeneratePackageJson.flags> {
    static description = `Generate mono repo package json`;

    static flags = {
        releaseGroup: releaseGroupFlag({ required: true }),
        ...BaseCommand.flags,
    };

    async run() {
        const flags = this.processedFlags;
        const timer = new Timer(flags.timer);

        const context = await this.getContext();

        // Load the package
        const repo = context.repo;
        timer.time("Package scan completed");

        const releaseGroup = repo.releaseGroups.get(flags.releaseGroup);
        assert(releaseGroup !== undefined, `Release group not found: ${flags.releaseGroup}`);

        await generateMonoRepoInstallPackageJson(releaseGroup, this.logger);
    }
}
