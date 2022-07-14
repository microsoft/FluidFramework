/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as path from "path";
import { VersionBag, ReferenceVersionBag } from "./versionBag";
import { commonOptions } from "../common/commonOptions";
import { Timer } from "../common/timer";
import { getPackageManifest } from "../common/fluidUtils";
import { FluidRepo, IPackageManifest } from "../common/fluidRepo";
import { isMonoRepoKind, MonoRepo, MonoRepoKind } from "../common/monoRepo";
import { Package } from "../common/npmPackage";
import { logVerbose } from "../common/logging";
import { GitRepo } from "./gitRepo";
import { fatal, prereleaseSatisfies } from "./utils";

/**
 * Context provides access to data about the Fluid repo, and exposes methods to interrogate the repo state.
 */
export class Context {
    public readonly repo: FluidRepo;
    public readonly fullPackageMap: Map<string, Package>;

    private readonly timer: Timer;
    private readonly packageManifest: IPackageManifest;
    private readonly newBranches: string[] = [];
    private readonly newTags: string[] = [];

    constructor(
        public readonly gitRepo: GitRepo,
        public readonly originRemotePartialUrl: string,
        public readonly originalBranchName: string,
        logVerbose = false,
    ) {
        this.timer = new Timer(commonOptions.timer);

        // Load the package
        this.repo = new FluidRepo(this.gitRepo.resolvedRoot, false, logVerbose);
        this.timer.time("Package scan completed");

        this.fullPackageMap = this.repo.createPackageMap();
        this.packageManifest = getPackageManifest(this.repo.resolvedRoot);
    }

    private reloadPackageJson() {
        this.repo.reload();
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

        return versions;
    }

    public async collectVersionInfo(releaseGroup: MonoRepoKind | string) {
        console.log("  Resolving published dependencies");

        const depVersions =
            new ReferenceVersionBag(this.repo.resolvedRoot, this.fullPackageMap, this.collectVersions());
        const pendingDepCheck: Package[] = [];
        const processMonoRepo = (monoRepo: MonoRepo) => {
            pendingDepCheck.push(...monoRepo.packages);
            // Fake these for printing.
            const firstClientPackage = monoRepo.packages[0];
            depVersions.add(firstClientPackage, firstClientPackage.version);
        };

        if (isMonoRepoKind(releaseGroup)) {
            const repoKind = releaseGroup;
            if (repoKind === MonoRepoKind.Server) {
                assert(this.repo.serverMonoRepo, "Attempted to collect server info on a Fluid repo with no server directory");
            }
            processMonoRepo(this.repo.monoRepos.get(repoKind)!);
        } else {
            const pkg = this.fullPackageMap.get(releaseGroup);
            if (!pkg) {
                fatal(`Can't find package ${releaseGroup} to release`);
            }
            pendingDepCheck.push(pkg);
            depVersions.add(pkg, pkg.version);
        }

        const publishedPackageDependenciesPromises: Promise<void>[] = [];
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const pkg = pendingDepCheck.pop();
            if (!pkg) {
                break;
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
                            fatal(`Inconsistent package version within ${pkg.monoRepo!.kind} monorepo\n   ${pkg.name}@${pkg.version}\n  ${dep}@${depBuildPackage.version}`);
                        }
                        if (version !== `^${depBuildPackage.version}`) {
                            fatal(`Inconsistent version dependency within ${pkg.monoRepo!.kind} monorepo in ${pkg.name}\n  actual: ${dep}@${version}\n  expected: ${dep}@^${depBuildPackage.version}`);
                        }
                        continue;
                    }
                    const depVersion = depBuildPackage.version;
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
     * Start with client marked as to be bumped, determine whether their dependent monorepo or packages
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

    /**
     * Returns the packages that belong to the specified release group.
     *
     * @param releaseGroup - The release group to filter by
     * @returns An array of packages that belong to the release group
     */
    public packagesForReleaseGroup(releaseGroup: MonoRepoKind) {
        let packages: Package[] = [...this.fullPackageMap.values()];
        packages = packages.filter(pkg => pkg.monoRepo?.kind === releaseGroup);
        return packages;
    }
}
