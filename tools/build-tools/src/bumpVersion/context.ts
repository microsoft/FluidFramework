/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as path from "path";
import { VersionBag, ReferenceVersionBag } from "./versionBag";
import { commonOptions } from "../common/commonOptions";
import { Timer } from "../common/timer";
import { GitRepo, fatal, prereleaseSatisfies } from "./utils";
import { getPackageManifest } from "../common/fluidUtils";
import { FluidRepo, IPackageManifest } from "../common/fluidRepo";
import { MonoRepo, MonoRepoKind } from "../common/monoRepo";
import { Package } from "../common/npmPackage";
import { logVerbose } from "../common/logging";

import * as semver from "semver";

export type VersionBumpType = "major" | "minor" | "patch";
export type VersionChangeType = VersionBumpType | semver.SemVer;
export function isVersionBumpType(type: VersionChangeType | string): type is VersionBumpType {
    return type === "major" || type === "minor" || type === "patch";
}

export class Context {
    public readonly repo: FluidRepo;
    public readonly fullPackageMap: Map<string, Package>;
    public readonly templatePackage: Package;

    private readonly timer: Timer;
    private readonly generatorPackage: Package;
    private readonly packageManifest: IPackageManifest;
    private readonly newBranches: string[] = [];
    private readonly newTags: string[] = [];

    constructor(
        public readonly gitRepo: GitRepo,
        public readonly originRemotePartialUrl: string,
        public readonly originalBranchName: string
    ) {
        this.timer = new Timer(commonOptions.timer);

        // Load the package
        this.repo = new FluidRepo(this.gitRepo.resolvedRoot, false);
        this.timer.time("Package scan completed");

        this.fullPackageMap = this.repo.createPackageMap();
        this.packageManifest = getPackageManifest(this.repo.resolvedRoot);

        // TODO: Is there a way to generate this automatically?
        if (!this.packageManifest.generatorName) { fatal(`Unable to find generator package name in package.json`) }
        const generatorPackage = this.fullPackageMap.get(this.packageManifest.generatorName);
        if (!generatorPackage) { fatal(`Unable to find ${this.packageManifest.generatorName} package`) };
        this.generatorPackage = generatorPackage;
        this.templatePackage = new Package(path.join(generatorPackage.directory, "app", "templates", "package.json"), "tools");
    }

    private reloadPackageJson() {
        this.repo.reload();
        this.templatePackage.reload();
    }

    /**
     * Collect the version of the packages in a VersionBag
     */
    public collectVersions(reloadPackageJson = false) {
        if (reloadPackageJson) {
            this.reloadPackageJson();
        }
        const versions = new VersionBag();

        this.repo.packages.packages.forEach(pkg => {
            if (pkg.packageJson.private && pkg.monoRepo === undefined) {
                return;
            }
            versions.add(pkg, pkg.version);
        });

        versions.add(this.templatePackage, this.templatePackage.version);
        return versions;
    }

    public async collectVersionInfo(releaseName: string) {
        console.log("  Resolving published dependencies");

        const depVersions = new ReferenceVersionBag(this.repo.resolvedRoot, this.fullPackageMap, this.collectVersions());
        const pendingDepCheck = [];
        const processMonoRepo = (monoRepo: MonoRepo) => {
            pendingDepCheck.push(...monoRepo.packages);
            // Fake these for printing.
            const firstClientPackage = monoRepo.packages[0];
            depVersions.add(firstClientPackage, firstClientPackage.version);
        };

        if (releaseName === MonoRepoKind[MonoRepoKind.Client]) {
            processMonoRepo(this.repo.clientMonoRepo);
        } else if (releaseName === MonoRepoKind[MonoRepoKind.Server]) {
            assert(this.repo.serverMonoRepo, "Attempted to collect server info on a Fluid repo with no server directory");
            processMonoRepo(this.repo.serverMonoRepo!);
        } else {
            const pkg = this.fullPackageMap.get(releaseName);
            if (!pkg) {
                fatal(`Can't find package ${releaseName} to release`);
            }
            pendingDepCheck.push(pkg);
            depVersions.add(pkg, pkg.version);
        }

        const publishedPackageDependenciesPromises: Promise<void>[] = [];
        while (true) {
            const pkg = pendingDepCheck.pop();
            if (!pkg) {
                break;
            }
            if (pkg === this.generatorPackage) {
                pendingDepCheck.push(this.templatePackage);
            }
            for (const { name: dep, version, dev } of pkg.combinedDependencies) {
                // Find the package in the repo
                const depBuildPackage = this.fullPackageMap.get(dep);
                // TODO: special casing tools to not be considered for release
                if (depBuildPackage && depBuildPackage.group !== "tools") {
                    if (ReferenceVersionBag.checkPrivate(pkg, depBuildPackage, dev)) {
                        continue;
                    }

                    if (MonoRepo.isSame(pkg.monoRepo, depBuildPackage.monoRepo)) {
                        // If it is the same repo, there are all related, and we would have added them to the pendingDepCheck as a set already.
                        // Just verify that the two package has the same version and the dependency has the same version
                        if (pkg.version !== depBuildPackage.version) {
                            fatal(`Inconsistent package version within ${MonoRepoKind[pkg.monoRepo!.kind].toLowerCase()} monorepo\n   ${pkg.name}@${pkg.version}\n  ${dep}@${depBuildPackage.version}`);
                        }
                        if (version !== `^${depBuildPackage.version}`) {
                            fatal(`Inconsistent version dependency within ${MonoRepoKind[pkg.monoRepo!.kind].toLowerCase()} monorepo in ${pkg.name}\n  actual: ${dep}@${version}\n  expected: ${dep}@^${depBuildPackage.version}`);
                        }
                        continue;
                    }
                    let depVersion = depBuildPackage.version;
                    const reference = `${pkg.name}@local`;
                    // Check if the version in the repo is compatible with the version described in the dependency.

                    if (prereleaseSatisfies(depBuildPackage.version, version)) {
                        if (!depVersions.get(depBuildPackage)) {
                            logVerbose(`${depBuildPackage.nameColored}: Add from ${pkg.nameColored} ${version}`);
                            if (depBuildPackage.monoRepo) {
                                pendingDepCheck.push(...depBuildPackage.monoRepo.packages);
                            } else {
                                pendingDepCheck.push(depBuildPackage);
                            }
                        }
                        depVersions.add(depBuildPackage, depVersion, dev, reference);
                    } else {
                        publishedPackageDependenciesPromises.push(depVersions.collectPublishedPackageDependencies(depBuildPackage, version, dev, reference));
                    }
                }
            }
        }
        await Promise.all(publishedPackageDependenciesPromises);

        return depVersions;
    }

    /**
     * Start with client and generator package marka as to be bumped, determine whether their dependent monorepo or packages
     * has the same version to the current version in the repo and needs to be bumped as well
     */
    public async collectBumpInfo(releaseName: string) {
        const depVersions = await this.collectVersionInfo(releaseName);
        depVersions.printRelease();
        return depVersions;
    }

    public async createBranch(branchName: string) {
        if (await this.gitRepo.getShaForBranch(branchName)) {
            fatal(`${branchName} already exists. Failed to create.`)
        }
        await this.gitRepo.createBranch(branchName);
        this.newBranches.push(branchName);
    }

    public async cleanUp() {
        await this.gitRepo.switchBranch(this.originalBranchName);
        for (const branch of this.newBranches) {
            await this.gitRepo.deleteBranch(branch);
        }
        for (const tag of this.newTags) {
            await this.gitRepo.deleteTag(tag);
        }
    }
};
