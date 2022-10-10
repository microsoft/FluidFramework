/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as semver from "semver";

import { MonoRepo } from "../common/monoRepo";
import { Package } from "../common/npmPackage";
import { exec, execNoError, fatal } from "./utils";

export class VersionBag {
    private versionData: { [key: string]: string } = {};

    public isEmpty(): boolean {
        return this.size === 0;
    }

    public get size(): number {
        return Object.keys(this.versionData).length;
    }
    public add(pkg: Package, version: string) {
        const existing = this.internalAdd(pkg, version);
        if (existing) {
            fatal(`Inconsistent version for ${pkg.name} ${version} && ${existing}`);
        }
    }
    protected internalAdd(pkg: Package, version: string, override: boolean = false) {
        const entryName = VersionBag.getEntryName(pkg);
        const existing = this.versionData[entryName];
        if (existing !== version) {
            if (existing) {
                if (!override) {
                    return existing;
                }
                console.log(`    Overriding ${entryName} ${existing} -> ${version}`);
            }
            this.versionData[entryName] = version;
            return existing;
        }
    }
    public get(pkgOrMonoRepoName: Package | string) {
        const entryName =
            typeof pkgOrMonoRepoName === "string"
                ? pkgOrMonoRepoName
                : VersionBag.getEntryName(pkgOrMonoRepoName);
        return this.versionData[entryName];
    }
    public [Symbol.iterator]() {
        return Object.entries(this.versionData)[Symbol.iterator]();
    }

    protected static getEntryName(pkg: Package): string {
        if (pkg.monoRepo !== undefined) {
            return pkg.monoRepo.kind;
        } else {
            return pkg.name;
        }
    }
}

/**
 * A specialized {@link VersionBag} that tracks dependency version information about packages and detects conflicting
 * dependencies. It can also be used to collect dependency information from packages published to npm.
 */
export class ReferenceVersionBag extends VersionBag {
    private readonly referenceData = new Map<string, { reference: string; published: boolean }>();
    private readonly nonDevDep = new Set<string>();
    private readonly publishedPackage = new Set<string>();
    private readonly publishedPackageRange = new Set<string>();

    constructor(
        private readonly repoRoot: string,
        private readonly fullPackageMap: Map<string, Package>,
        public readonly repoVersions: VersionBag,
    ) {
        super();
    }

    /**
     * Add package and version to the version bag, with optional reference to indicate where the reference comes from.
     * Will error if there is a conflicting dependency versions, if the references are from the local repo, otherwise
     * warn.
     *
     * @param pkg
     * @param version
     * @param newReference
     */
    public add(
        pkg: Package,
        version: string,
        dev: boolean = false,
        newReference?: string,
        published: boolean = false,
    ) {
        const entryName = VersionBag.getEntryName(pkg);
        // Override existing we haven't seen a non-dev dependency yet, and it is not a published version or it is not a dev dependency
        const override = !this.nonDevDep.has(entryName) && (!published || !dev);
        const existing = this.internalAdd(pkg, version, override);

        if (!dev) {
            if (existing) {
                const existingReference = this.referenceData.get(entryName);
                const message = `Inconsistent dependency to ${pkg.name}\n  ${version.padStart(
                    10,
                )} in ${newReference}\n  ${existing.padStart(10)} in ${
                    existingReference?.reference
                }`;
                if (
                    existingReference?.reference &&
                    this.publishedPackage.has(existingReference.reference) &&
                    newReference &&
                    this.publishedPackage.has(newReference)
                ) {
                    // only warn if the conflict is between two published references (since we can't change it anyways).
                    console.warn(`WARNING: ${message}`);
                } else {
                    fatal(message);
                }
            }
            this.nonDevDep.add(entryName);
        } else if (existing) {
            console.log(
                `      Ignored mismatched dev dependency ${pkg.name}@${version} vs ${existing}`,
            );
            // Don't replace the existing reference if it is an ignored dev dependency
            return;
        }
        if (newReference) {
            this.referenceData.set(entryName, { reference: newReference, published });
        }
    }

    private async getPublishedMatchingVersion(rangeSpec: string, reference: string | undefined) {
        const ret = await execNoError(`npm view "${rangeSpec}" version --json`, this.repoRoot);
        if (!ret) {
            if (reference) {
                fatal(
                    `Unable to get published version for ${rangeSpec} referenced from ${reference}.`,
                );
            }
            // If a reference is not given, we can just skip it if it doesn't exist
            return undefined;
        }
        let publishedVersions: string | string[];
        try {
            publishedVersions = JSON.parse(ret);
        } catch (e) {
            if (reference) {
                fatal(
                    `Unable to parse published version for ${rangeSpec} referenced from ${reference}.\nOutput: ${ret}`,
                );
            }
            // If a reference is not given, we can just skip it if it doesn't exist
            return undefined;
        }

        return Array.isArray(publishedVersions)
            ? publishedVersions.sort(semver.rcompare)[0]
            : publishedVersions;
    }

    private async getPublishedDependencies(versionSpec: string, dev: boolean) {
        const dep = dev ? "devDependencies" : "dependencies";
        const retDep = await exec(
            `npm view ${versionSpec} ${dep} --json`,
            this.repoRoot,
            "look up dependencies",
        );
        // detect if there are no dependencies
        if (retDep.trim() === "") {
            return undefined;
        }

        try {
            return JSON.parse(retDep);
        } catch (e) {
            fatal(`Unable to parse dependencies for ${versionSpec}.\nOutput: ${retDep}`);
        }
    }

    public static checkPrivate(pkg: Package, dep: Package, dev: boolean) {
        if (dep.packageJson.private) {
            if (!pkg.packageJson.private && !dev) {
                fatal(
                    `Private package not a dev dependency\n   ${pkg.name}@${pkg.version}\n  ${dep.name}@${dep.version}`,
                );
            }
            if (!MonoRepo.isSame(pkg.monoRepo, dep.monoRepo)) {
                fatal(
                    `Private package not in the same monorepo\n   ${pkg.name}@${pkg.version}\n  ${dep.name}@${dep.version}`,
                );
            }
            return true;
        }
        return false;
    }

    /**
     * Given a package a version range, ask NPM for a list of version that satisfies it, and find the latest version.
     * That version is added to the version bag, and will error on conflict.
     * It then ask NPM for the list of dependency for the matched version, and collect the version as well.
     *
     * @param pkg - The package to begin collection information
     * @param versionRange - The version range to match
     * @param repoRoot - Where the repo root is
     * @param fullPackageMap - Map of all the package in the repo
     * @param reference - Reference of this dependency for error reporting in case of conflict
     */
    public async collectPublishedPackageDependencies(
        pkg: Package,
        versionRange: string,
        dev: boolean,
        reference?: string,
    ) {
        const entryName = VersionBag.getEntryName(pkg);
        const rangeSpec = `${pkg.name}@${versionRange}`;

        // Check if we already checked this published package range
        if (this.publishedPackageRange.has(rangeSpec)) {
            return;
        }

        this.publishedPackageRange.add(rangeSpec);

        let matchedVersion: string | undefined = this.get(entryName);
        if (!matchedVersion || !semver.satisfies(matchedVersion, versionRange)) {
            matchedVersion = await this.getPublishedMatchingVersion(rangeSpec, reference);
            if (!matchedVersion) {
                return;
            }
        }
        console.log(`    Found ${rangeSpec} => ${matchedVersion}`);
        this.add(pkg, matchedVersion, dev, reference, true);

        // Get the dependencies
        const versionSpec = `${pkg.name}@${matchedVersion}`;
        if (this.publishedPackage.has(versionSpec)) {
            return;
        }
        this.publishedPackage.add(versionSpec);

        const pending: Promise<void>[] = [];
        const addPublishedDependencies = async (dev: boolean) => {
            const dep = await this.getPublishedDependencies(versionSpec, dev);
            // Add it to pending for processing
            for (const d in dep) {
                const depPkg = this.fullPackageMap.get(d);
                if (depPkg) {
                    if (ReferenceVersionBag.checkPrivate(pkg, depPkg, dev)) {
                        continue;
                    }
                    pending.push(
                        this.collectPublishedPackageDependencies(depPkg, dep[d], dev, versionSpec),
                    );
                }
            }
        };
        await Promise.all([addPublishedDependencies(true), addPublishedDependencies(false)]);
        await Promise.all(pending);
    }

    public printRelease() {
        console.log("Release Versions:");
        for (const [name] of this.repoVersions) {
            const depVersion = this.get(name) ?? "undefined";
            const state = this.needRelease(name)
                ? "(new)"
                : this.needBump(name)
                ? "(current)"
                : "(old)";
            console.log(`${name.padStart(40)}: ${depVersion.padStart(10)} ${state}`);
        }
        console.log();
    }

    public printPublished(name: string) {
        console.log(`Current Versions from ${name}:`);
        for (const [name] of this.repoVersions) {
            const depVersion = this.get(name) ?? "undefined";
            console.log(
                `${name.padStart(40)}: ${depVersion.padStart(10)} ${
                    depVersion === "undefined"
                        ? ""
                        : this.needRelease(name)
                        ? "(local)"
                        : "(published)"
                }`,
            );
        }
        console.log();
    }

    public needBump(name: string) {
        return this.repoVersions.get(name) === this.get(name);
    }
    public needRelease(name: string) {
        if (this.needBump(name)) {
            const data = this.referenceData.get(name)!;
            return !data || !data.published;
        }
        return false;
    }
}

export function getRepoStateChange(oldVersions: VersionBag, newVersions: VersionBag) {
    let repoState = "";
    for (const [name, newVersion] of newVersions) {
        const oldVersion = oldVersions.get(name) ?? "undefined";
        if (oldVersion !== newVersion) {
            repoState += `\n${name.padStart(40)}: ${oldVersion.padStart(10)} -> ${newVersion.padEnd(
                10,
            )}`;
        } else {
            repoState += `\n${name.padStart(40)}: ${newVersion.padStart(10)} (unchanged)`;
        }
    }
    return repoState;
}
