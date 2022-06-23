/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Command } from "@oclif/core";
import { getResolvedFluidRoot } from "@fluidframework/build-tools/src/common/fluidUtils";
import { GitRepo } from "@fluidframework/build-tools/src/bumpVersion/gitRepo";
import { Context } from "@fluidframework/build-tools/src/bumpVersion/context";
import { showVersions } from "@fluidframework/build-tools/src/bumpVersion/showVersions";
import { parseNameVersion } from "@fluidframework/build-tools/src/bumpVersion/bumpVersionCli";
import BaseBumpCommand from "./index";

export default class Current extends BaseBumpCommand {
    static description = "Show package version info";

    static flags = {
        ...super.flags,
    };

    static args = [];

    async run(): Promise<void> {
        const { args, flags } = await this.parse(Current);

        const resolvedRoot = await getResolvedFluidRoot();
        console.log(`Repo: ${resolvedRoot}`);
        const gitRepo = new GitRepo(resolvedRoot);
        const branch = await gitRepo.getCurrentBranchName();
        const context = new Context(gitRepo, "github.com/microsoft/FluidFramework", branch);

        const { name, version, extra } = parseNameVersion(flags.package);

        if (version) {
            if (typeof version !== "string") {
                paramVersion = version;
            } else {
                fatal(`Invalid version ${version} for flag --version`);
            }
        }


        await showVersions(context, name, version);
    }
}
