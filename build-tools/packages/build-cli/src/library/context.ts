/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReleaseVersion } from "@fluid-tools/version-tools";
import {
	FluidRepo,
	type IFluidBuildConfig,
	Package,
	getFluidBuildConfig,
} from "@fluidframework/build-tools";
import { type FlubConfig, getFlubConfig } from "../config.js";
import { Repository } from "./git.js";

/**
 * Represents a release version and its release date, if applicable.
 *
 * @internal
 */
export interface VersionDetails {
	/**
	 * The version of the release.
	 */
	version: ReleaseVersion;

	/**
	 * The date the version was released, if applicable.
	 */
	date?: Date;
}

/**
 * Represents the different types of release groups supported by the build tools. Each of these groups should be defined
 * in the fluid-build section of the root package.json.
 * @deprecated should switch to ReleaseGroup.  Currently the only difference is "azure" not in ReleaseGroup.
 */
export enum MonoRepoKind {
	Client = "client",
	Server = "server",
	Azure = "azure",
	BuildTools = "build-tools",
	GitRest = "gitrest",
	Historian = "historian",
}

/**
 * A type guard used to determine if a string is a MonoRepoKind.
 * @deprecated should switch to isReleaseGroup
 */
export function isMonoRepoKind(str: string | undefined): str is MonoRepoKind {
	if (str === undefined) {
		return false;
	}

	const list = Object.values<string>(MonoRepoKind);
	const isMonoRepoValue = list.includes(str);
	return isMonoRepoValue;
}

/**
 * Context provides access to data about the Fluid repo, and exposes methods to interrogate the repo state.
 */
export class Context {
	public readonly repo: FluidRepo;
	public readonly fullPackageMap: Map<string, Package>;
	public readonly fluidBuildConfig: IFluidBuildConfig;
	public readonly flubConfig: FlubConfig;
	private checkedIsGitRepo = false;

	constructor(public readonly root: string) {
		// Load the packages
		this.fluidBuildConfig = getFluidBuildConfig(root);
		this.flubConfig = getFlubConfig(root);
		this.repo = new FluidRepo(root, this.fluidBuildConfig.repoPackages);
		this.fullPackageMap = this.repo.createPackageMap();
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
		const packages =
			releaseGroup instanceof Package
				? this.packages.filter((p) => p.name !== releaseGroup.name)
				: this.packages.filter((pkg) => pkg.monoRepo?.kind !== releaseGroup);
		return packages;
	}

	/**
	 * Get all the packages not associated with a release group
	 * @returns An array of packages in the repo that are not associated with a release group.
	 */
	public get independentPackages(): Package[] {
		const packages = this.packages.filter((pkg) => pkg.monoRepo === undefined);
		return packages;
	}

	/**
	 * Get all the packages.
	 * @returns An array of all packages in the repo.
	 */
	public get packages(): Package[] {
		return [...this.fullPackageMap.values()];
	}

	/**
	 * Gets the version for a package or release group.
	 *
	 * @returns A version string.
	 *
	 */
	public getVersion(key: string): string {
		let ver = "";

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
		return ver;
	}

	private _gitRepository: Repository | undefined;

	public async getGitRepository(): Promise<Repository> {
		if (this._gitRepository === undefined && !this.checkedIsGitRepo) {
			const repo = new Repository({ baseDir: this.root }, "microsoft/FluidFramework");
			const isRepo = await repo.gitClient.checkIsRepo();
			this.checkedIsGitRepo = true;
			this._gitRepository = isRepo ? repo : undefined;
		}

		if (this._gitRepository === undefined) {
			throw new Error(`Not in a git repository: ${this.root}`);
		}

		return this._gitRepository;
	}
}
