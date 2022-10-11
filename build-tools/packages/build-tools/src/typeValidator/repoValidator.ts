/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import minimatch from "minimatch";
import path from "path";

import { IFluidRepoPackageEntry } from "../common/fluidRepo";
import { getPackageManifest } from "../common/fluidUtils";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import { FluidRepoBuild } from "../fluidBuild/fluidRepoBuild";
import { getPackageDetails } from "./packageJson";
import { BrokenTypes, validatePackage } from "./packageValidator";
import { BreakingIncrement, log } from "./validatorUtils";

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
interface PackageGroup {
    name: string;
    directory: string;
    ignoredDirs?: string[];
}

export interface IValidationOptions {
    /**
     * Only check the specified packages/groups rather than everything
     * Correctness for transitive type breaks is not expected with this option
     */
    includeOnly?: Set<string>;
}

/**
 * Package name: {break severity, package's group}
 */
export type RepoValidationResult = Map<string, { level: BreakingIncrement; group?: string }>;

function buildPackageGroups(repoRoot: string): PackageGroup[] {
    const manifest = getPackageManifest(repoRoot);
    const groups: PackageGroup[] = [];
    const repoPackages = manifest.repoPackages ?? [];
    const addGroup = (name: string, entry: IFluidRepoPackageEntry) => {
        if (name === "client") {
            // special case client for now because its values expect
            // special handling in the old repo structure
            groups.push({ name, directory: "packages/**" });
        } else if (Array.isArray(entry)) {
            // This can create multiple groups with the same name but these are
            // tracked by name later and get combined
            entry.map((subEntry) => addGroup(name, subEntry));
        } else if (typeof entry === "string") {
            groups.push({ name, directory: path.join(entry, "**") });
        } else {
            groups.push({
                name,
                // add "**" for glob matching since we match package paths to these dirs
                // rather than traversing these dirs for packages
                directory: path.join(entry.directory, "**"),
                // ignoredDirs are relative to the directory
                ignoredDirs: entry.ignoredDirs?.map((relDir) =>
                    path.join(entry.directory, relDir, "**"),
                ),
            });
        }
    };
    for (const name in repoPackages) {
        addGroup(name, repoPackages[name]);
    }
    log(groups);
    return groups;
}

function groupForPackage(groups: PackageGroup[], pkgJsonPath: string): string | undefined {
    for (const group of groups) {
        group_block: {
            // return the first group that matches any include glob and doesn't
            // match any exclude glob
            if (minimatch(pkgJsonPath, group.directory)) {
                for (const exclude of group.ignoredDirs ?? []) {
                    if (minimatch(pkgJsonPath, exclude)) {
                        break group_block;
                    }
                }
                return group.name;
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
    const pkgGroupName = groups ? groupForPackage(groups, pkgDir) : undefined;
    if (pkgGroupName !== undefined) {
        groupBreaks.set(
            pkgGroupName,
            pkgIncrement | (groupBreaks.get(pkgGroupName) ?? BreakingIncrement.none),
        );
    }

    return pkgGroupName;
}

export async function validateRepo(options?: IValidationOptions): Promise<RepoValidationResult> {
    // Get all the repo packages in topological order
    const repoRoot = await getResolvedFluidRoot();
    const repo = new FluidRepoBuild(repoRoot, false);
    repo.setMatched({ all: true, match: [], dirs: [] } as any);
    const buildGraph = repo.createBuildGraph({ symlink: true, fullSymlink: false }, ["build"]);
    const packages = buildGraph.buildPackages;

    const packageGroups = buildPackageGroups(repoRoot);

    const groupBreaks = new Map<string, BreakingIncrement>();
    const allBrokenTypes: BrokenTypes = new Map();
    const breakResult: RepoValidationResult = new Map();

    // filter to only included packages if specified
    if (options?.includeOnly !== undefined) {
        packages.forEach((buildPkg, pkgName) => {
            const pkgJsonPath = path.join(buildPkg.pkg.directory, "package.json");
            const pkgJsonRelativePath = path.relative(repoRoot, pkgJsonPath);
            const group = groupForPackage(packageGroups, pkgJsonRelativePath);
            if (
                !(
                    options.includeOnly?.has(pkgName) ||
                    (group !== undefined && options.includeOnly?.has(group))
                )
            ) {
                packages.delete(pkgName);
            }
        });
    }

    for (let i = 0; packages.size > 0; i++) {
        packages.forEach(async (buildPkg, pkgName) => {
            if (buildPkg.level === i) {
                const packageData = await getPackageDetails(buildPkg.pkg.directory);
                const pkgJsonPath = path.join(buildPkg.pkg.directory, "package.json");
                const pkgJsonRelativePath = path.relative(repoRoot, pkgJsonPath);
                if (packageData.oldVersions.length > 0) {
                    log(`${pkgName}, ${buildPkg.level}`);

                    const { increment, brokenTypes } = await validatePackage(
                        packageData,
                        buildPkg.pkg.directory,
                        allBrokenTypes,
                    );

                    brokenTypes.forEach((v, k) => allBrokenTypes.set(k, v));

                    // Add to group breaks
                    const groupName = setPackageGroupIncrement(
                        pkgJsonRelativePath,
                        increment,
                        packageGroups,
                        groupBreaks,
                    );

                    if (breakResult.has(packageData.pkg.name)) {
                        throw new Error("Encountered duplicated package name");
                    }

                    breakResult.set(packageData.pkg.name, { level: increment, group: groupName });
                }

                packages.delete(pkgName);
            }
        });
    }

    // Check for inherited group breaks
    breakResult.forEach((value, key) => {
        if (value.group !== undefined) {
            const groupLevel = groupBreaks.get(value.group)!;
            if (groupLevel > value.level) {
                value.level = groupLevel;
                log(`${key} inherited break from its group ${value.group}`);
            }
        }
    });

    breakResult.forEach((value, key) => {
        console.log(`${key}: ${value.level} ${value.group}`);
    });

    return breakResult;
}
