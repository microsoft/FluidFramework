/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as semver from "semver";
import { getResolvedFluidRoot } from "@fluidframework/build-tools/src/common/fluidUtils";
import { GitRepo } from "@fluidframework/build-tools/src/bumpVersion/gitRepo";
import {
    Context,
    VersionBumpTypeExtended,
    VersionBumpType,
} from "@fluidframework/build-tools/src/bumpVersion/context";
import { bumpTypeFlag, releaseGroupFlag } from "../../flags";
import {
    setReleaseGroupVersion,
    bumpRepo,
} from "@fluidframework/build-tools/src/bumpVersion/bumpVersion";
import {
    isMonoRepoKind,
    MonoRepoKind,
    supportedMonoRepoValues,
} from "@fluidframework/build-tools/src/common/monoRepo";
import { BaseCommand } from "../../base";
import { adjustVersion } from "@fluidframework/build-tools/src/bumpVersion/utils";
import { VersionBag } from "@fluidframework/build-tools/src/bumpVersion/versionBag";

export default class Bump extends BaseCommand {
    static description = "Write versions to package.json";

    static flags = {
        ...super.flags,
        type: bumpTypeFlag(),
        releaseGroup: releaseGroupFlag(),
    };

    static args = [];

    async run(): Promise<void> {
        const { args, flags } = await this.parse(Bump);

        const resolvedRoot = await getResolvedFluidRoot();
        console.log(`Repo: ${resolvedRoot}`);
        const gitRepo = new GitRepo(resolvedRoot);
        const branch = await gitRepo.getCurrentBranchName();
        this.log(`Branch: ${branch}`);
        const context = new Context(gitRepo, "github.com/microsoft/FluidFramework", branch);

        const bumpType = flags.type as VersionBumpTypeExtended;

        switch (bumpType) {
            // case "current": {
            //     if (flags.releaseGroup && isMonoRepoKind(flags.releaseGroup)) {
            //         const rg = context.repo.monoRepos.get(flags.releaseGroup);
            //         this.log(`Monorepo version: ${rg?.version}`);
            //         const versionToSet = await adjustVersion(rg?.version, bumpType);
            //         await setReleaseGroupVersion(context, versionToSet!, flags.releaseGroup);
            //     } else {
            //         this.log("Running on all release groups.");
            //         for (const monoRepoKind of supportedMonoRepoValues()) {
            //             const rg = context.repo.monoRepos.get(monoRepoKind);
            //             this.log(`${monoRepoKind} version: ${rg?.version}`);
            //             // eslint-disable-next-line no-await-in-loop
            //             const versionToSet = await adjustVersion(rg?.version, bumpType);
            //             // eslint-disable-next-line no-await-in-loop
            //             await setReleaseGroupVersion(context, versionToSet!, monoRepoKind);
            //         }
            //     }

            //     break;
            // }

            default: {
                const monoReposToBump: MonoRepoKind[] = [];

                if (flags.releaseGroup && isMonoRepoKind(flags.releaseGroup)) {
                    monoReposToBump.push(flags.releaseGroup);
                } else {
                    this.log("Running on all release groups.");
                    monoReposToBump.push(...supportedMonoRepoValues())
                }

                for (const monoRepoKind of monoReposToBump) {
                    const rg = context.repo.monoRepos.get(monoRepoKind);
                    this.log(`${monoRepoKind} version: ${rg?.version}`);
                    // eslint-disable-next-line no-await-in-loop
                    const versionToSet = await adjustVersion(rg?.version, bumpType);
                    // eslint-disable-next-line no-await-in-loop
                    await setReleaseGroupVersion(context, versionToSet!, monoRepoKind);
                    // eslint-disable-next-line no-await-in-loop
                    const newVersions = await bumpRepo(
                        context,
                        bumpType,
                        new Set([MonoRepoKind.Azure]),
                        new Set(),
                        false,
                        new VersionBag(),
                    );
                    // const repoState = getRepoStateChange(depVersions.repoVersions, newVersions);
                }
            }
        }
    }
}
