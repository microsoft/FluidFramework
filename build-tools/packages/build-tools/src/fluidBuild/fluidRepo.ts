/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";

import { MonoRepo } from "../common/monoRepo";
import { Package, Packages } from "../common/npmPackage";
import { ExecAsyncResult } from "../common/utils";
import {
	type IFluidBuildDir,
	type IFluidBuildDirEntry,
	type IFluidBuildDirs,
} from "./fluidBuildConfig";

/**
 * @deprecated Should not be used outside the build-tools package.
 */
export class FluidRepo {
	private readonly _releaseGroups = new Map<string, MonoRepo>();

	public get releaseGroups() {
		return this._releaseGroups;
	}

	public readonly packages: Packages;

	public constructor(
		public readonly resolvedRoot: string,
		fluidBuildDirs?: IFluidBuildDirs,
	) {
		// Expand to full IFluidRepoPackage and full path
		const normalizeEntry = (item: IFluidBuildDirEntry): IFluidBuildDir | IFluidBuildDir[] => {
			if (Array.isArray(item)) {
				return item.map((entry) => normalizeEntry(entry) as IFluidBuildDir);
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
		const loadOneEntry = (item: IFluidBuildDir, group: string) => {
			return Packages.loadDir(item.directory, group, item.ignoredDirs);
		};

		const loadedPackages: Package[] = [];
		for (const group in fluidBuildDirs) {
			const item = normalizeEntry(fluidBuildDirs[group]);
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
