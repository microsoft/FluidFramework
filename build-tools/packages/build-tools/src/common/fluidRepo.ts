/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as path from "path";

import { ReleaseVersion, VersionBumpType } from "@fluid-tools/version-tools";

import { PreviousVersionStyle } from "../typeValidator/packageJson";
import { getFluidBuildConfig } from "./fluidUtils";
import { Logger, defaultLogger } from "./logging";
import { MonoRepo, MonoRepoKind, isMonoRepoKind } from "./monoRepo";
import { Package, Packages, ScriptDependencies } from "./npmPackage";
import { ExecAsyncResult } from "./utils";

/**
 * Fluid build configuration that is expected in the repo-root package.json.
 */
export interface IFluidBuildConfig {
	/**
	 * A mapping of package or release group names to metadata about the package or release group. This can only be
	 * configured in the rrepo-wide Fluid build config (the repo-root package.json).
	 */
	repoPackages: {
		[name: string]: IFluidRepoPackageEntry;
	};

	/**
	 * dependencies defined here will be incorporated into fluid-build's build graph. This can be used to manually
	 * fluid-build about dependencies it doesn't automatically detect.
	 */
	buildDependencies?: {
		merge?: {
			[key: string]: ScriptDependencies;
		};
	};

	/**
	 * @deprecated
	 */
	generatorName?: string;

	/**
	 * Policy configuration for the `check:policy` command. This can only be configured in the rrepo-wide Fluid build
	 * config (the repo-root package.json).
	 */
	policy?: PolicyConfig;

	/**
	 * A mapping of branch names to previous version baseline styles. The type test generator takes this information
	 * into account when calculating the baseline version to use when it's run on a particular branch. If this is not
	 * defined for a branch or package, then that package will be skipped during type test generation.
	 */
	branchReleaseTypes?: {
		[name: string]: VersionBumpType | PreviousVersionStyle;
	};
}

/**
 * Policy configuration for the `check:policy` command.
 */
export interface PolicyConfig {
	additionalLockfilePaths?: string[];
	dependencies?: {
		requireTilde?: string[];
	};
}

/**
 * Metadata about known-broken types.
 */
export interface BrokenCompatSettings {
	backCompat?: false;
	forwardCompat?: false;
}

/**
 * A mapping of a type name to its {@link BrokenCompatSettings}.
 */
export type BrokenCompatTypes = Partial<Record<string, BrokenCompatSettings>>;

export interface ITypeValidationConfig {
	/**
	 * The version of the package. Should match the version field in package.json.
	 */
	version: string;

	/**
	 * An object containing types that are known to be broken.
	 */
	broken: BrokenCompatTypes;

	/**
	 * If true, disables type test preparation and generation for the package.
	 */
	disabled?: boolean;

	/**
	 * The previous version style that was used when the prepare phase was run. This value is cached so that
	 * generation can work even on branches without the correct config.
	 */
	previousVersionStyle?: PreviousVersionStyle;

	/**
	 * The version range used as the "previous" version to compare against when generating type tests. This may be
	 * an exact version or a range string.
	 */
	baselineRange?: string;

	/**
	 * The exact version used as the "previous" version to compare against when generating type tests. This should
	 * always be an exact version.
	 */
	baselineVersion?: string;
}

/**
 * Configures a package or release group
 */
export interface IFluidRepoPackage {
	/**
	 * The path to the package. For release groups this should be the path to the root of the release group.
	 */
	directory: string;

	/**
	 * An array of paths under `directory` that should be ignored.
	 */
	ignoredDirs?: string[];
}

export type IFluidRepoPackageEntry = string | IFluidRepoPackage | (string | IFluidRepoPackage)[];

export class FluidRepo {
	/**
	 * @deprecated Use .releaseGroups instead.
	 */
	public readonly monoRepos = new Map<MonoRepoKind, MonoRepo>();

	public get releaseGroups() {
		return this.monoRepos;
	}

	public readonly packages: Packages;

	/**
	 * @deprecated Use releaseGroups.get() instead.
	 */
	public get clientMonoRepo(): MonoRepo {
		return this.releaseGroups.get(MonoRepoKind.Client)!;
	}

	/**
	 * @deprecated Use releaseGroups.get() instead.
	 */
	public get serverMonoRepo(): MonoRepo | undefined {
		return this.releaseGroups.get(MonoRepoKind.Server);
	}

	/**
	 * @deprecated Use releaseGroups.get() instead.
	 */
	public get azureMonoRepo(): MonoRepo | undefined {
		return this.releaseGroups.get(MonoRepoKind.Azure);
	}

	constructor(
		public readonly resolvedRoot: string,
		services: boolean,
		private readonly logger: Logger = defaultLogger,
	) {
		const packageManifest = getFluidBuildConfig(resolvedRoot);

		// Expand to full IFluidRepoPackage and full path
		const normalizeEntry = (
			item: IFluidRepoPackageEntry,
		): IFluidRepoPackage | IFluidRepoPackage[] => {
			if (Array.isArray(item)) {
				return item.map((entry) => normalizeEntry(entry) as IFluidRepoPackage);
			}
			if (typeof item === "string") {
				return { directory: path.join(resolvedRoot, item), ignoredDirs: undefined };
			}
			const directory = path.join(resolvedRoot, item.directory);
			return {
				directory,
				ignoredDirs: item.ignoredDirs?.map((dir) => path.join(directory, dir)),
			};
		};
		const loadOneEntry = (item: IFluidRepoPackage, group: string) => {
			return Packages.loadDir(item.directory, group, item.ignoredDirs);
		};

		const loadedPackages: Package[] = [];
		for (const group in packageManifest.repoPackages) {
			const item = normalizeEntry(packageManifest.repoPackages[group]);
			if (isMonoRepoKind(group)) {
				const { directory, ignoredDirs } = item as IFluidRepoPackage;
				const monorepo = new MonoRepo(group, directory, ignoredDirs, logger);
				this.releaseGroups.set(group, monorepo);
				loadedPackages.push(...monorepo.packages);
			} else if (group !== "services" || services) {
				if (Array.isArray(item)) {
					for (const i of item) {
						loadedPackages.push(...loadOneEntry(i, group));
					}
				} else {
					loadedPackages.push(...loadOneEntry(item, group));
				}
			}
		}

		if (!this.releaseGroups.has(MonoRepoKind.Client)) {
			throw new Error("client entry does not exist in package.json");
		}
		this.packages = new Packages(loadedPackages);
	}

	public createPackageMap() {
		return new Map<string, Package>(this.packages.packages.map((pkg) => [pkg.name, pkg]));
	}

	public reload() {
		this.packages.packages.forEach((pkg) => pkg.reload());
	}

	public static async ensureInstalled(packages: Package[], check: boolean = true) {
		const installedMonoRepo = new Set<MonoRepo>();
		const installPromises: Promise<ExecAsyncResult>[] = [];
		for (const pkg of packages) {
			if (!check || !(await pkg.checkInstall(false))) {
				if (pkg.monoRepo) {
					if (!installedMonoRepo.has(pkg.monoRepo)) {
						installedMonoRepo.add(pkg.monoRepo);
						installPromises.push(pkg.monoRepo.install());
					}
				} else {
					installPromises.push(pkg.install());
				}
			}
		}
		const rets = await Promise.all(installPromises);
		return !rets.some((ret) => ret.error);
	}

	public async install(nohoist: boolean = false) {
		if (nohoist) {
			return this.packages.noHoistInstall(this.resolvedRoot);
		}
		return FluidRepo.ensureInstalled(this.packages.packages);
	}
}

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
