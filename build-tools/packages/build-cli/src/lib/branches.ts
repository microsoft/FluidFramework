/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context, MonoRepoKind } from "@fluidframework/build-tools";
import {
    bumpVersionScheme,
    detectVersionScheme,
    fromInternalScheme,
    fromVirtualPatchScheme,
    toVirtualPatchScheme,
    VersionBumpType,
    VersionBumpTypeExtended,
} from "@fluid-tools/version-tools";
import { PackageName } from "@rushstack/node-core-library";
import * as semver from "semver";
import { isReleaseGroup, ReleaseGroup, ReleasePackage, ReleaseSource } from "../releaseGroups";
import { DependencyUpdateType } from "./bump";

/**
 * Creates an appropriate branch for a release group and bump type. Does not commit!
 *
 * @param context - The {@link Context}.
 * @param releaseGroupOrPackage - The release group or independent package to create a branch for.
 * @param bumpType - The bump type.
 * @returns The name of the newly created branch.
 *
 * @remarks
 *
 * Generated branch names are of the form `bump_<RELEASEGROUP>_<BUMPTYPE>_<VERSION>`.
 *
 * @internal
 */
export async function createBumpBranch(
    context: Context,
    releaseGroupOrPackage: ReleaseGroup | ReleasePackage,
    bumpType: VersionBumpType,
) {
    const version = context.getVersion(releaseGroupOrPackage);
    const name = generateBumpVersionBranchName(releaseGroupOrPackage, bumpType, version);
    await context.createBranch(name);
    return name;
}

/**
 * Generates an appropriate branch name from a release group, bump type, and version.
 *
 * @param releaseGroupOrPackage - The release group or independent package to generate a branch name for.
 * @param bumpType - The bump type.
 * @param version - The version to use for the generated branch name.
 * @returns The generated branch name.
 *
 * @remarks
 *
 * Generated branch names are of the form `bump_<RELEASEGROUP>_<BUMPTYPE>_<VERSION>`.
 *
 * @internal
 */
export function generateBumpVersionBranchName(
    releaseGroupOrPackage: ReleaseGroup | ReleasePackage,
    bumpType: VersionBumpTypeExtended,
    version: string,
) {
    const newVersion = bumpVersionScheme(version, bumpType);
    const name = isReleaseGroup(releaseGroupOrPackage)
        ? releaseGroupOrPackage
        : PackageName.getUnscopedName(releaseGroupOrPackage);
    const branchName = `bump_${name.toLowerCase()}_${bumpType}_${newVersion}`;
    return branchName;
}

/**
 * Generates an appropriate branch name for bumping dependencies on a release group or package.
 *
 * @param bumpedDep - The release group on which dependencies were bumped.
 * @param bumpType - The bump type.
 * @param releaseGroup - If set, changes were made to only this release group.
 * @returns The generated branch name.
 *
 * @remarks
 *
 * Generated branch names are of the form `bump_deps_<RELEASEGROUP>_<BUMPTYPE>`.
 *
 * @internal
 */
export function generateBumpDepsBranchName(
    bumpedDep: ReleaseGroup,
    bumpType: DependencyUpdateType | VersionBumpType,
    releaseGroup?: ReleaseGroup,
): string {
    const releaseGroupSegment = releaseGroup ? `_${releaseGroup}` : "";
    const branchName = `bump_deps_${bumpedDep.toLowerCase()}_${bumpType}${releaseGroupSegment}`;
    return branchName;
}

/**
 * Generates the correct branch name for the release branch of a given release group and branch.
 *
 * @param releaseGroup - The release group for which to generate a branch name.
 * @param version - The version for the release branch. Typically this is a major.minor version, but for release groups
 * using the Fluid internal or virtualPatch version schemes the versions may differ.
 * @returns The generated branch name.
 *
 * @remarks
 *
 * Generated branch names are of the form `release/<RELEASEGROUP>/<MAJOR.MINORVERSION>`.
 *
 * @internal
 */
export function generateReleaseBranchName(releaseGroup: ReleaseGroup, version: string): string {
    // An array of all the sections of a "path" branch -- a branch with slashes in the name.
    const branchPath = ["release"];

    const scheme = detectVersionScheme(version);
    const schemeIsInternal = scheme === "internal" || scheme === "internalPrerelease";

    let branchVersion: string;
    if (schemeIsInternal === true) {
        branchVersion = fromInternalScheme(version)[1].version;
    } else if (scheme === "virtualPatch") {
        branchVersion = fromVirtualPatchScheme(version).version;
    } else {
        branchVersion = version;
    }

    if (releaseGroup === "client") {
        if (schemeIsInternal) {
            branchPath.push("v2int");
        }
    } else {
        branchPath.push(releaseGroup);
    }

    const releaseBranchVersion =
        scheme === "virtualPatch"
            ? toVirtualPatchScheme(
                  `${semver.major(branchVersion)}.${semver.minor(branchVersion)}.0`,
              ).version
            : `${semver.major(branchVersion)}.${semver.minor(branchVersion)}`;
    branchPath.push(releaseBranchVersion);

    const releaseBranch = branchPath.join("/");
    return releaseBranch;
}

/**
 * @param branchName - The branch name to check.
 * @returns The default {@link VersionBumpType} for the branch, or `undefined` if no default is set for the branch.
 *
 * @internal
 */
export function getDefaultBumpTypeForBranch(branchName: string): VersionBumpType | undefined {
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

const releaseGroupReleaseTypeMap = new Map<string, ReleaseSource>([
    [MonoRepoKind.BuildTools, "interactive"],
]);

/**
 * @internal
 */
export function getReleaseSourceForReleaseGroup(
    releaseGroupOrPackage: ReleaseGroup | ReleasePackage,
): ReleaseSource {
    if (!isReleaseGroup(releaseGroupOrPackage)) {
        return "direct";
    }

    if ([MonoRepoKind.BuildTools].includes(releaseGroupOrPackage)) {
        return "interactive";
    }

    return "releaseBranches";
}
