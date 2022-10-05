/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as fs from "fs";
import * as path from "path";

import { getResolvedFluidRoot } from "../common/fluidUtils";
import { MonoRepoKind, isMonoRepoKind, supportedMonoRepoValues } from "../common/monoRepo";
import { Context } from "./context";

/**
 * Write the versions of all the packages in the repo that would exist if the current
 * repo state would be published.  This means the current repo version if that package
 * needs to be released, or the latest released version if it doesn't.
 *
 * Note: This will need to be updated accordingly when server/client groups are no longer
 * versioned in lockstep.
 *
 * @param context the repo context
 */
export async function writeReleaseVersions(context: Context) {
    const depVersions = await context.collectVersionInfo(MonoRepoKind.Client);

    const packageVersions: { [packageName: string]: string } = {};
    for (const [name] of depVersions.repoVersions) {
        const version = depVersions.get(name);
        if (version !== undefined) {
            packageVersions[name] = version;
        }
    }

    // Replace release groups (e.g. "Client" and "Server") with their constituent packages
    for (const pkg of context.repo.packages.packages) {
        if (isMonoRepoKind(pkg.group)) {
            packageVersions[pkg.name] = packageVersions[pkg.group];
        }
    }

    for (const repo of supportedMonoRepoValues()) {
        delete packageVersions[repo];
    }

    // write out to versions.json in the current folder
    fs.writeFileSync(
        path.join(await getResolvedFluidRoot(), "versions.json"),
        JSON.stringify(packageVersions, undefined, 4),
    );
}
