/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";

import { TaskDefinitionsOnDisk } from "./fluidTaskDefinitions";
import { MonoRepo } from "./monoRepo";
import { Package, Packages } from "./npmPackage";
import { ExecAsyncResult } from "./utils";

export interface IRepoBuildConfig {
	/**
	 * Build tasks and dependencies definitions
	 */
	tasks?: TaskDefinitionsOnDisk;

	/**
	 * A mapping of package or release group names to metadata about the package or release group. This can only be
	 * configured in the repo-wide Fluid build config (the repo-root package.json).
	 */
	repoPackages?: IRepoBuildDirs;
}

/**
 * Configures a package or release group
 */
export interface IRepoBuildDir {
	/**
	 * The path to the package. For release groups this should be the path to the root of the release group.
	 */
	directory: string;

	/**
	 * An array of paths under `directory` that should be ignored.
	 */
	ignoredDirs?: string[];
}

export type IRepoBuildDirEntry = string | IRepoBuildDir | (string | IRepoBuildDir)[];

export interface IRepoBuildDirs {
	[name: string]: IRepoBuildDirEntry;
}

export class FluidRepo {
	private readonly _releaseGroups = new Map<string, MonoRepo>();

	public get releaseGroups() {
		return this._releaseGroups;
	}

	public readonly packages: Packages;

	public constructor(
		public readonly resolvedRoot: string,
		repoBuildDirs?: IRepoBuildDirs,
	) {
		// Expand to full IFluidRepoPackage and full path
		const normalizeEntry = (item: IRepoBuildDirEntry): IRepoBuildDir | IRepoBuildDir[] => {
			if (Array.isArray(item)) {
				return item.map((entry) => normalizeEntry(entry) as IRepoBuildDir);
			}
			if (typeof item === "string") {
				return {
					directory: path.join(resolvedRoot, item),
					ignoredDirs: undefined,
				};
			}
			const directory = path.join(resolvedRoot, item.directory);
			return {
				directory,
				ignoredDirs: item.ignoredDirs?.map((dir) => path.join(directory, dir)),
			};
		};
		const loadOneEntry = (item: IRepoBuildDir, group: string) => {
			return Packages.loadDir(item.directory, group, item.ignoredDirs);
		};

		const loadedPackages: Package[] = [];
		for (const group in repoBuildDirs) {
			const item = normalizeEntry(repoBuildDirs[group]);
			if (Array.isArray(item)) {
				for (const i of item) {
					loadedPackages.push(...loadOneEntry(i, group));
				}
				continue;
			}
			const monoRepo = MonoRepo.load(group, item);
			if (monoRepo) {
				this.releaseGroups.set(group, monoRepo);
				loadedPackages.push(...monoRepo.packages);
			} else {
				loadedPackages.push(...loadOneEntry(item, group));
			}
		}
		this.packages = new Packages(loadedPackages);
	}

	public createPackageMap() {
		return new Map<string, Package>(this.packages.packages.map((pkg) => [pkg.name, pkg]));
	}

	public reload() {
		this.packages.packages.forEach((pkg) => pkg.reload());
	}

	public static async ensureInstalled(packages: Package[]) {
		const installedMonoRepo = new Set<MonoRepo>();
		const installPromises: Promise<ExecAsyncResult>[] = [];
		for (const pkg of packages) {
			if (pkg.monoRepo) {
				if (!installedMonoRepo.has(pkg.monoRepo)) {
					installedMonoRepo.add(pkg.monoRepo);
					installPromises.push(pkg.monoRepo.install());
				}
			} else {
				installPromises.push(pkg.install());
			}
		}
		const rets = await Promise.all(installPromises);
		return !rets.some((ret) => ret.error);
	}

	public async install() {
		return FluidRepo.ensureInstalled(this.packages.packages);
	}

	/**
	 * Transforms an absolute path to a path relative to the repo root.
	 *
	 * @param p - The path to make relative to the repo root.
	 * @returns the relative path.
	 */
	public relativeToRepo(p: string): string {
		// Replace \ in result with / in case OS is Windows.
		return path.relative(this.resolvedRoot, p).replace(/\\/g, "/");
	}
}
