/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import { getResolvedFluidRoot } from "@fluidframework/build-tools/src/common/fluidUtils";
// import { GitRepo } from "@fluidframework/build-tools/src/bumpVersion/gitRepo";
// import {
//     Context,
//     VersionBumpTypeExtended,
//     VersionBumpType,
// } from "@fluidframework/build-tools/src/bumpVersion/context";
// import {
//     setReleaseGroupVersion,
//     bumpRepo,
// } from "@fluidframework/build-tools/src/bumpVersion/bumpVersion";
// import {
//     isMonoRepoKind,
//     MonoRepoKind,
//     supportedMonoRepoValues,
// } from "@fluidframework/build-tools/src/common/monoRepo";
// import { adjustVersion } from "@fluidframework/build-tools/src/bumpVersion/utils";
// import { VersionBag } from "@fluidframework/build-tools/src/bumpVersion/versionBag";
import { BaseCommand } from "../base";
import { bumpTypeFlag, packageFilterFlags, releaseGroupFlag } from "../flags";

export abstract class BaseBumpCommand extends BaseCommand {
    static description = "Bump versions of packages and dependencies.";

    static flags = {
        ...super.flags,
        ...packageFilterFlags(),
    };

    // async run(): Promise<void> {
    // }
}

export default class BumpCommand extends BaseBumpCommand {
    static description = "Bump versions of packages and dependencies.";

    static flags = {
        ...super.flags,
        type: bumpTypeFlag(),
        releaseGroup: releaseGroupFlag(),
    };

    static args = [];

    async run(): Promise<void> {
        const { args, flags } = await this.parse(BumpCommand);
        this.error(`Not yet implemented`, { exit: 100 });
    }
}
