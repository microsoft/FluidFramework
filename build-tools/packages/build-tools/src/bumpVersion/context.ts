/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";

import { commonOptions } from "../common/commonOptions";
import { FluidRepo, IPackageManifest } from "../common/fluidRepo";
import { getPackageManifest } from "../common/fluidUtils";
import { Logger, defaultLogger } from "../common/logging";
import { MonoRepo, MonoRepoKind, isMonoRepoKind } from "../common/monoRepo";
import { Package } from "../common/npmPackage";
import { Timer } from "../common/timer";
import { GitRepo } from "./gitRepo";
import { fatal, prereleaseSatisfies } from "./utils";
import { ReferenceVersionBag, VersionBag } from "./versionBag";

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
        private readonly logger: Logger = defaultLogger,
    ) {
        this.timer = new Timer(commonOptions.timer);

        // Load the package
        this.repo = new FluidRepo(this.gitRepo.resolvedRoot, false, logger);
        this.timer.time("Package scan completed");

        this.fullPackageMap = this.repo.createPackageMap();
        this.packageManifest = getPackageManifest(this.repo.resolvedRoot);
    }

    private reloadPackageJson() {
        this.repo.reload();
    }

    /**
     * Returns a {@link VersionBag} of all packages in the repo.
     *
     * @param reloadPackageJson - If true, the package.json for each package will be reloaded. Otherwise the cached
     * in-memory values will be used.
     */
    public collectVersions(reloadPackageJson = false): VersionBag {
        if (reloadPackageJson) {
            this.reloadPackageJson();
        }
        const versions = new VersionBag();

        this.repo.packages.packages.forEach((pkg) => {
            if (pkg.packageJson.private && pkg.monoRepo === undefined) {
                return;
            }
            versions.add(pkg, pkg.version);
        });

        return versions;
    }

    public async collectVersionInfo(
        releaseGroup: MonoRepoKind | string,
    ): Promise<ReferenceVersionBag> {
        this.logger.info("  Resolving published dependencies");

        const depVersions = new ReferenceVersionBag(
            this.repo.resolvedRoot,
            this.fullPackageMap,
            this.collectVersions(),
        );
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
                assert(
                    this.repo.serverMonoRepo,
                    "Attempted to collect server info on a Fluid repo with no server directory",
                );
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
                            fatal(
                                `Inconsistent package version within ${
                                    pkg.monoRepo!.kind
                                } monorepo\n   ${pkg.name}@${pkg.version}\n  ${dep}@${
                                    depBuildPackage.version
                                }`,
                            );
                        }
                        if (version !== `^${depBuildPackage.version}`) {
                            fatal(
                                `Inconsistent version dependency within ${
                                    pkg.monoRepo!.kind
                                } monorepo in ${
                                    pkg.name
                                }\n  actual: ${dep}@${version}\n  expected: ${dep}@^${
                                    depBuildPackage.version
                                }`,
                            );
                        }
                        continue;
                    }
                    const depVersion = depBuildPackage.version;
                    const reference = `${pkg.name}@local`;
                    // Check if the version in the repo is compatible with the version described in the dependency.

                    if (prereleaseSatisfies(depBuildPackage.version, version)) {
                        if (!depVersions.get(depBuildPackage)) {
                            this.logger.verbose(
                                `${depBuildPackage.nameColored}: Add from ${pkg.nameColored} ${version}`,
                            );
                            if (depBuildPackage.monoRepo) {
                                pendingDepCheck.push(...depBuildPackage.monoRepo.packages);
                            } else {
                                pendingDepCheck.push(depBuildPackage);
                            }
                        }
                        depVersions.add(depBuildPackage, depVersion, dev, reference);
                    } else {
                        publishedPackageDependenciesPromises.push(
                            depVersions.collectPublishedPackageDependencies(
                                depBuildPackage,
                                version,
                                dev,
                                reference,
                            ),
                        );
                    }
                }
            }
        }
        await Promise.all(publishedPackageDependenciesPromises);

        return depVersions;
    }

    /**
     * Given a release group to bump, this function determines whether any of its dependencies should be bumped to new
     * versions based on the latest published versions on npm.
     */
    public async collectBumpInfo(releaseGroup: MonoRepoKind | string) {
        const depVersions = await this.collectVersionInfo(releaseGroup);
        depVersions.printRelease();
        return depVersions;
    }

    public async createBranch(branchName: string) {
        if (await this.gitRepo.getShaForBranch(branchName)) {
            fatal(`${branchName} already exists. Failed to create.`);
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
    public packagesInReleaseGroup(releaseGroup: MonoRepoKind): Package[] {
        const packages = this.packages.filter((pkg) => pkg.monoRepo?.kind === releaseGroup);
        return packages;
    }

    /**
     * Returns the packages that do not belong to the specified release group.
     *
     * @param releaseGroup - The release group or package to filter by.
     * @returns An array of packages that do not belong to the release group.
     */
    public packagesNotInReleaseGroup(releaseGroup: MonoRepoKind | Package): Package[] {
        let packages: Package[];
        if (releaseGroup instanceof Package) {
            packages = this.packages.filter((p) => p.name !== releaseGroup.name);
        } else {
            packages = this.packages.filter((pkg) => pkg.monoRepo?.kind !== releaseGroup);
        }

        return packages;
    }

    /**
     * @returns An array of packages in the repo that are not associated with a release group.
     */
    public get independentPackages(): Package[] {
        const packages = this.packages.filter((pkg) => pkg.monoRepo === undefined);
        return packages;
    }

    /**
     * @returns An array of all packages in the repo.
     */
    public get packages(): Package[] {
        return [...this.fullPackageMap.values()];
    }

    /**
     * Gets the version for a package or release group. If a versionBag was provided, it will be searched for the
     * package. Otherwise, the value is assumed to be a release group, so the context is searched.
     *
     * @returns A version string.
     */
    public getVersion(key: MonoRepoKind | string, versionBag?: VersionBag): string {
        let ver = "";
        if (versionBag !== undefined && !versionBag.isEmpty()) {
            ver = versionBag.get(key);
        } else {
            if (isMonoRepoKind(key)) {
                const rgRepo = this.repo.releaseGroups.get(key);
                if (rgRepo === undefined) {
                    throw new Error(`Release group not found: ${key}`);
                }
                ver = rgRepo.version;
            } else {
                const pkg = this.fullPackageMap.get(key);
                if (pkg === undefined) {
                    throw new Error(`Package not in context: ${key}`);
                }
                ver = pkg.version;
            }
        }
        return ver;
    }
}
