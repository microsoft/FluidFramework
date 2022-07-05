/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context } from "./context";
import { ReferenceVersionBag } from "./versionBag";
import { fatal } from "./utils";
import { MonoRepo, MonoRepoKind } from "../common/monoRepo";
import { Package } from "../common/npmPackage";
import * as semver from "semver";
import { strict as assert } from "assert";

export async function showVersions(context: Context, name: string, publishedVersion?: semver.SemVer) {
    let versions: ReferenceVersionBag;
    if (!publishedVersion) {
        versions = await context.collectVersionInfo(name);
    } else {
        const processMonoRepo = async (monoRepo: MonoRepo) => {
            await Promise.all(monoRepo.packages.map(pkg => {
                return depVersions.collectPublishedPackageDependencies(pkg, publishedVersion.toString(), false)
            }));
        };
        const depVersions = new ReferenceVersionBag(context.repo.resolvedRoot, context.fullPackageMap, context.collectVersions());
        let pkg: Package | undefined;
        if (name === MonoRepoKind[MonoRepoKind.Client]) {
            await processMonoRepo(context.repo.clientMonoRepo);
        } else if (name === MonoRepoKind[MonoRepoKind.Server]) {
            assert(context.repo.serverMonoRepo, "Attempted show server versions on a Fluid repo with no server directory");
            await processMonoRepo(context.repo.serverMonoRepo!);
        } else {
            pkg = context.fullPackageMap.get(name);
            if (!pkg) {
                fatal(`Package ${name} not in repo`);
            }
        }
        versions = depVersions;
    }

    versions.printPublished(name);
}
