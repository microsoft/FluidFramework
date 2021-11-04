/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import minimatch from "minimatch";
import path from "path";
import { FluidRepoBuild } from "../fluidBuild/fluidRepoBuild"
import { BuildPackage } from "../fluidBuild/buildGraph"
import { getResolvedFluidRoot } from "../common/fluidUtils";
import { getPackageDetails } from "./packageJson";
import { BreakingIncrement, BrokenTypes, validatePackage } from "./packageValidator";
import { enableLogging, log } from "./validatorUtils";
import { group } from "console";

/**
 * Groupings of packages that should be versioned in lockstep
 * include/exclude are glob paths relative to the repo root
 * Not all packages need to be attributed to groups
 * Currently expects package groups to not cross other packages in the
 * dependency tree, i.e. a package receiving an version increment due to
 * another package in its group should not also then require other packages
 * to need a major/minor version increment that isn't already needed.
 * TODO: verify/fix this expectation
 */
export interface PackageGroup {
    name: string,
    include: string[],
    exclude?: string[],
}

export interface IValidationOptions {
    packageGroups?: PackageGroup[],

    /**
     * Enable verbose logging for specific packages rather than everything
     */
    logForPackages?: Set<string>;
}

function groupForPackage(groups: PackageGroup[], pkgJsonPath: string): string | undefined {
    for (const group of groups) {
        group_block: {
            // return the first group that matches any include glob and doesn't
            // match any exclude glob
            for (const include of group.include) {
                if (minimatch(pkgJsonPath, include)) {
                    for (const exclude of group.exclude ?? []) {
                        if (minimatch(pkgJsonPath, exclude)) {
                            break group_block;
                        }
                    }
                    return group.name;
                }
            }
        }
    }
    return undefined;
}

/**
 * Update the increment for a group
 * @param pkgDir - relative dir from repo root of the package to check
 * @param pkgIncrement - the determined breaking increment for the package
 *  independent of any group inclusions
 * @param groups - the package groupings for the repo
 * @param groupBreaks - existing breaking increments for the package groupings
 * @returns - the group name for the package
 */
function setPackageGroupIncrement(
    pkgDir: string,
    pkgIncrement: BreakingIncrement,
    groups: PackageGroup[] | undefined,
    groupBreaks: Map<string, BreakingIncrement>,
): string | undefined {
    let pkgGroupName = groups ? groupForPackage(groups, pkgDir) : undefined;
    if (pkgGroupName !== undefined) {
        groupBreaks.set(
            pkgGroupName,
            pkgIncrement | (groupBreaks.get(pkgGroupName) ?? BreakingIncrement.none),
        );
    }

    return pkgGroupName;
}


export async function validateRepo(options?: IValidationOptions) {
    // Get all the repo packages in topological order
    const repoRoot = await getResolvedFluidRoot();
    const repo = new FluidRepoBuild(repoRoot, false);
    repo.setMatched({all: true, match: [], dirs: [] } as any);
    const buildGraph = repo.createBuildGraph({symlink: true, fullSymlink: false}, ["build"]);
    const packages = buildGraph.buildPackages;

    const groupBreaks = new Map<string, BreakingIncrement>();
    const allBrokenTypes: BrokenTypes = new Map();
    const breakSummary: any[] = [];

    for (let i = 0; packages.size > 0; i++) {
        packages.forEach((buildPkg, pkgName) => {
            if (buildPkg.level === i) {
                if (options?.logForPackages?.has(pkgName)) {
                    enableLogging(true);
                }

                const packageData = getPackageDetails(buildPkg.pkg.directory);
                const pkgJsonPath = path.join(buildPkg.pkg.directory, "package.json");
                const pkgJsonRelativePath = path.relative(repoRoot, pkgJsonPath);
                if (packageData.oldVersions.length > 0) {
                    log(`${pkgName}, ${buildPkg.level}`);

                    let { increment, brokenTypes} = validatePackage(packageData, pkgJsonPath, allBrokenTypes);

                    brokenTypes.forEach((v, k) => allBrokenTypes.set(k, v));

                    // Add to group breaks
                    const groupName = setPackageGroupIncrement(
                        pkgJsonRelativePath, increment, options?.packageGroups, groupBreaks);

                    breakSummary.push({ name: packageData.name, level: increment, group: groupName });
                }

                packages.delete(pkgName);

                if (options?.logForPackages?.has(pkgName)) {
                    enableLogging(false);
                }
            }
        })
    }

    // Check for inherited group breaks
    for (const pkgBreak of breakSummary) {
        if (pkgBreak.group !== undefined) {
            const groupLevel = groupBreaks.get(pkgBreak.group)!;
            if (groupLevel > pkgBreak.level) {
                pkgBreak.level = groupLevel;
                log(`${pkgBreak.name} inherited break from its group ${pkgBreak.group}`);
            }
        }
    }

    for (const pkgBreak of breakSummary) {
        console.log(pkgBreak);
    }
}