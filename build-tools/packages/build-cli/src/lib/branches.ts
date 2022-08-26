/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context } from "@fluidframework/build-tools";
import {
    bumpVersionScheme,
    detectVersionScheme,
    fromInternalScheme,
    VersionBumpType,
    VersionBumpTypeExtended,
} from "@fluid-tools/version-tools";
import * as semver from "semver";
import { isReleaseGroup, ReleaseGroup, ReleasePackage } from "../releaseGroups";
import { getPackageShortName } from "./package";

// export async function createBranchForBump(
//     context: Context,
//     releaseGroup: ReleaseGroup,
//     newVersion: string,
//     ): Promise<string> {
//         const bumpBranch = `bump_${releaseGroup.toLowerCase()}_${newVersion}_${Date.now()}`;
//         await context.createBranch(bumpBranch);
//         return bumpBranch;
//     }

/**
 * Creates a branch with changes for a release group bump. Does not commit!
 * @param context -
 * @param releaseGroup -
 * @param bumpType -
 * @returns The name of the newly created branch.
 */
export async function createBumpBranch(
    context: Context,
    releaseGroup: ReleaseGroup | ReleasePackage,
    bumpType: VersionBumpType,
) {
    const version = context.getVersion(releaseGroup);
    const name = bumpBranchName(releaseGroup, bumpType, version);
    await context.createBranch(name);
    return name;
}

/**
 * Generates a consistent branch name from a release group, bump type, and version.
 * @param releaseGroup -
 * @param bumpType -
 * @param version -
 * @returns The branch name.
 */
export function bumpBranchName(
    releaseGroup: ReleaseGroup | ReleasePackage,
    bumpType: VersionBumpTypeExtended,
    version: string,
) {
    const newVersion = bumpVersionScheme(version, bumpType);
    const name = isReleaseGroup(releaseGroup) ? releaseGroup : getPackageShortName(releaseGroup);
    const branchName = `bump_${name.toLowerCase()}_${bumpType}_${newVersion}`;
    return branchName;
}

export function bumpDepsBranchName(
    bumpedDep: ReleaseGroup,
    bumpType: VersionBumpTypeExtended | string,
    releaseGroup?: ReleaseGroup,
): string {
    const releaseGroupSegment = releaseGroup ? `_${releaseGroup}` : "";
    const branchName = `bump_deps_${bumpedDep.toLowerCase()}_${bumpType}${releaseGroupSegment}`;
    return branchName;
}

export function releaseBranchName(releaseGroup: ReleaseGroup, version: string): string {
    const scheme = detectVersionScheme(version);
    const branchVersion = scheme === "internal" ? fromInternalScheme(version)[1].version : version;
    const releaseBranchVersion =
        scheme === "virtualPatch"
            ? branchVersion
            : `${semver.major(branchVersion)}.${semver.minor(branchVersion)}`;
    const branchName = releaseGroup === "client" ? "v2int" : releaseGroup;
    const releaseBranch = `release/${branchName}/${releaseBranchVersion}`;
    return releaseBranch;
}

export function defaultReleaseForBranch(branchName: string): VersionBumpType | undefined {
    if (["main", "lts"].includes(branchName)) {
        return "minor";
    }

    if (branchName === "next") {
        return "major";
    }

    if (branchName.startsWith("release/")) {
        return "patch";
    }
}
