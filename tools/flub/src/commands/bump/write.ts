/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as semver from "semver";
import { Command } from "@oclif/core";
import { getResolvedFluidRoot } from "@fluidframework/build-tools/src/common/fluidUtils";
import { GitRepo } from "@fluidframework/build-tools/src/bumpVersion/gitRepo";
import { Context } from "@fluidframework/build-tools/src/bumpVersion/context";
import { showVersions } from "@fluidframework/build-tools/src/bumpVersion/showVersions";
import { parseNameVersion } from "@fluidframework/build-tools/src/bumpVersion/bumpVersionCli";
import BaseBumpCommand from "./index";
import { bumpTypeFlag } from "../../flags";
import { setReleaseGroupVersion } from "@fluidframework/build-tools/src/bumpVersion/bumpVersion";
import {
    isMonoRepoKind,
    supportedMonoRepoValues,
} from "@fluidframework/build-tools/src/common/monoRepo";

export default class Write extends BaseBumpCommand {
    static description = "Write versions to package.json";

    static flags = {
        ...super.flags,
        type: bumpTypeFlag(),
    };

    static args = [];

    async run(): Promise<void> {
        const { args, flags } = await this.parse(Write);

        const resolvedRoot = await getResolvedFluidRoot();
        console.log(`Repo: ${resolvedRoot}`);
        const gitRepo = new GitRepo(resolvedRoot);
        const branch = await gitRepo.getCurrentBranchName();
        this.log(`branch: ${branch}`);
        const context = new Context(gitRepo, "github.com/microsoft/FluidFramework", branch);

        const versionToShow = flags.releaseGroup ?? flags.package;
        this.log(versionToShow);
        // const versions = context.collectVersions();

        if (flags.releaseGroup && isMonoRepoKind(flags.releaseGroup)) {
            const rg = context.repo.monoRepos.get(flags.releaseGroup);
            this.log(`monorepo version: ${rg?.version}`);
            const versionToSet = semver.parse(rg?.version);
            await setReleaseGroupVersion(context, versionToSet!, flags.releaseGroup);
        } else {
            this.log("Running on all release groups.");
            for (const monoRepoKind of supportedMonoRepoValues()) {
                const rg = context.repo.monoRepos.get(monoRepoKind);
                this.log(`${monoRepoKind} version: ${rg?.version}`);
                const versionToSet = semver.parse(rg?.version);
                // eslint-disable-next-line no-await-in-loop
                await setReleaseGroupVersion(context, versionToSet!, monoRepoKind);
            }
        }


        // const { name, version, extra } = parseNameVersion(flags.package);
        // let semVersion: semver.SemVer | undefined;

        // if (version) {
        //     if (typeof version !== "string") {
        //         semVersion = version;
        //     } else {
        //         this.error(`Invalid version ${version}`);
        //     }
        // }
    }
}
