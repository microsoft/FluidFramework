/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import * as semver from "semver";

import { MonoRepo, MonoRepoKind, isMonoRepoKind } from "../common/monoRepo";
import { Package } from "../common/npmPackage";
import { Context } from "./context";
import { fatal } from "./utils";
import { ReferenceVersionBag } from "./versionBag";

// TODO: Validate and document this function.
export async function showVersions(
    context: Context,
    releaseGroup: MonoRepoKind | string,
    publishedVersion?: semver.SemVer,
) {
    let versions: ReferenceVersionBag;
    if (!publishedVersion) {
        versions = await context.collectVersionInfo(releaseGroup);
    } else {
        const processMonoRepo = async (monoRepo: MonoRepo) => {
            await Promise.all(
                monoRepo.packages.map((pkg) => {
                    return depVersions.collectPublishedPackageDependencies(
                        pkg,
                        publishedVersion.toString(),
                        false,
                    );
                }),
            );
        };
        const depVersions = new ReferenceVersionBag(
            context.repo.resolvedRoot,
            context.fullPackageMap,
            context.collectVersions(),
        );
        let pkg: Package | undefined;
        if (isMonoRepoKind(releaseGroup)) {
            if (releaseGroup === MonoRepoKind.Server) {
                assert(
                    context.repo.serverMonoRepo,
                    "Attempted show server versions on a Fluid repo with no server directory",
                );
            }
            await processMonoRepo(context.repo.monoRepos.get(releaseGroup)!);
        } else {
            pkg = context.fullPackageMap.get(releaseGroup);
            if (!pkg) {
                fatal(`Package ${releaseGroup} not in repo`);
            }
        }
        versions = depVersions;
    }

    versions.printPublished(releaseGroup);
}
