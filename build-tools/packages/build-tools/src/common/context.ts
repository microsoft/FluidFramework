/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { PackageName } from "@rushstack/node-core-library";

import { commonOptions } from "../common/commonOptions";
import { FluidRepo, IFluidBuildConfig, VersionDetails } from "../common/fluidRepo";
import { loadFluidBuildConfig } from "../common/fluidUtils";
import { isMonoRepoKind } from "../common/monoRepo";
import { Package } from "../common/npmPackage";
import { getVersionFromTag } from "../common/tags";
import { Timer } from "../common/timer";
import { GitRepo } from "./gitRepo";
import { fatal } from "./utils";
import { VersionBag } from "./versionBag";

/**
 * Context provides access to data about the Fluid repo, and exposes methods to interrogate the repo state.
 */
export class Context {
	public readonly repo: FluidRepo;
	public readonly fullPackageMap: Map<string, Package>;
	public readonly rootFluidBuildConfig: IFluidBuildConfig;

	private readonly timer: Timer;
	private readonly newBranches: string[] = [];

	constructor(
		public readonly gitRepo: GitRepo,
		public readonly originRemotePartialUrl: string,
		public readonly originalBranchName: string,
	) {
		this.timer = new Timer(commonOptions.timer);

		// Load the package
		this.repo = FluidRepo.create(this.gitRepo.resolvedRoot);
		this.timer.time("Package scan completed");

		this.fullPackageMap = this.repo.createPackageMap();
		this.rootFluidBuildConfig = loadFluidBuildConfig(this.repo.resolvedRoot);
	}

	/**
	 * @deprecated
	 */
	public async createBranch(branchName: string) {
		if (await this.gitRepo.getShaForBranch(branchName)) {
			fatal(`${branchName} already exists. Failed to create.`);
		}
		await this.gitRepo.createBranch(branchName);
		this.newBranches.push(branchName);
	}

	/**
	 * Returns the packages that belong to the specified release group.
	 *
	 * @param releaseGroup - The release group to filter by
	 * @returns An array of packages that belong to the release group
	 */
	public packagesInReleaseGroup(releaseGroup: string): Package[] {
		const packages = this.packages.filter((pkg) => pkg.monoRepo?.kind === releaseGroup);
		return packages;
	}

	/**
	 * Returns the packages that do not belong to the specified release group.
	 *
	 * @param releaseGroup - The release group or package to filter by.
	 * @returns An array of packages that do not belong to the release group.
	 */
	public packagesNotInReleaseGroup(releaseGroup: string | Package): Package[] {
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
	 *
	 * @deprecated
	 */
	public getVersion(key: string, versionBag?: VersionBag): string {
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

	private _tags: Map<string, string[]> = new Map();

	/**
	 * Returns an array of all the git tags associated with a release group.
	 *
	 * @param releaseGroupOrPackage - The release group or independent package to get tags for.
	 * @returns An array of all all the tags for the release group or package.
	 *
	 * @internal
	 */
	public async getTagsForReleaseGroup(releaseGroupOrPackage: string): Promise<string[]> {
		const prefix = isMonoRepoKind(releaseGroupOrPackage)
			? releaseGroupOrPackage.toLowerCase()
			: PackageName.getUnscopedName(releaseGroupOrPackage);
		const cacheEntry = this._tags.get(prefix);
		if (cacheEntry !== undefined) {
			return cacheEntry;
		}

		const tagList = await this.gitRepo.getAllTags(`${prefix}_v*`);
		return tagList;
	}

	private _loaded = false;

	/**
	 * Loads release data for all packages and release groups in the repo into memory.
	 */
	public async loadReleases(): Promise<void> {
		if (this._loaded) {
			return;
		}

		const releasePromises: Promise<VersionDetails[] | undefined>[] = [];
		for (const [kind] of this.repo.releaseGroups) {
			releasePromises.push(this.getAllVersions(kind));
		}
		for (const p of this.independentPackages) {
			releasePromises.push(this.getAllVersions(p.name));
		}

		await Promise.all(releasePromises);
		this._loaded = true;
	}

	private _versions: Map<string, VersionDetails[]> = new Map();

	/**
	 * Gets all the versions for a release group or independent package. This function only considers the tags in the
	 * repo to determine releases and dates.
	 *
	 * @param releaseGroupOrPackage - The release group or independent package to get versions for.
	 * @returns An array of {@link ReleaseDetails} containing the version and date for each version.
	 *
	 * @internal
	 *
	 * @deprecated
	 */
	public async getAllVersions(
		releaseGroupOrPackage: string,
	): Promise<VersionDetails[] | undefined> {
		const cacheEntry = this._versions.get(releaseGroupOrPackage);
		if (cacheEntry !== undefined) {
			return cacheEntry;
		}

		const versions = new Map<string, Date>();
		const tags = await this.getTagsForReleaseGroup(releaseGroupOrPackage);

		for (const tag of tags) {
			const ver = getVersionFromTag(tag);
			if (ver !== undefined && ver !== "" && ver !== null) {
				// eslint-disable-next-line no-await-in-loop
				const date = await this.gitRepo.getCommitDate(tag);
				versions.set(ver, date);
			}
		}

		if (versions.size === 0) {
			return undefined;
		}

		const toReturn: VersionDetails[] = [];
		for (const [version, date] of versions) {
			toReturn.push({ version, date });
		}

		this._versions.set(releaseGroupOrPackage, toReturn);
		return toReturn;
	}
}
