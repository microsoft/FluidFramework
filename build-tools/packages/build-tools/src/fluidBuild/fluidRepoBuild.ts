/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import chalk from "chalk";
import registerDebug from "debug";
import { FluidRepo, IFluidBuildDirs } from "../common/fluidRepo";
import { getFluidBuildConfig } from "../common/fluidUtils";
import { defaultLogger } from "../common/logging";
import { MonoRepo } from "../common/monoRepo";
import { Package, Packages } from "../common/npmPackage";
import {
	ExecAsyncResult,
	existsSync,
	globFn,
	isSameFileOrDir,
	lookUpDirSync,
} from "../common/utils";
import { BuildGraph } from "./buildGraph";
import { NpmDepChecker } from "./npmDepChecker";
import { ISymlinkOptions, symlinkPackage } from "./symlinkUtils";
const traceInit = registerDebug("fluid-build:init");

const { log } = defaultLogger;

export interface IPackageMatchedOptions {
	match: string[];
	all: boolean;
	dirs: string[];
	releaseGroups: string[];
}

export class FluidRepoBuild extends FluidRepo {
	public static create(resolvedRoot: string) {
		// Default to just resolveRoot if no config is found
		const packageManifest = getFluidBuildConfig(resolvedRoot) ?? {
			repoPackages: {
				root: "",
			},
		};
		return new FluidRepoBuild(resolvedRoot, packageManifest.repoPackages);
	}
	private constructor(resolvedRoot: string, repoPackages?: IFluidBuildDirs) {
		super(resolvedRoot, repoPackages);
	}

	public async clean() {
		return Packages.clean(this.packages.packages, false);
	}

	public async uninstall() {
		const cleanPackageNodeModules = this.packages.cleanNodeModules();
		const removePromise: Promise<ExecAsyncResult>[] = [];
		for (const g of this.releaseGroups.values()) {
			removePromise.push(g.uninstall());
		}

		const r = await Promise.all([cleanPackageNodeModules, Promise.all(removePromise)]);
		return r[0] && !r[1].some((ret) => ret?.error);
	}

	public setMatched(options: IPackageMatchedOptions) {
		const hasMatchArgs =
			options.match.length || options.dirs.length || options.releaseGroups.length;

		if (hasMatchArgs) {
			let matched = false;
			options.match.forEach((arg) => {
				const regExp = new RegExp(arg);
				if (this.matchWithFilter((pkg) => regExp.test(pkg.name))) {
					matched = true;
				}
			});

			options.dirs.forEach((arg) => {
				this.setMatchedDir(arg, false);
				matched = true;
			});

			options.releaseGroups.forEach((releaseGroupName) => {
				const releaseGroup = this.releaseGroups.get(releaseGroupName);
				if (releaseGroup === undefined) {
					throw new Error(
						`Release group '${releaseGroupName}' specified is not defined in the repo.`,
					);
				}
				this.setMatchedReleaseGroup(releaseGroup);
				matched = true;
			});
			return matched;
		}

		if (options.all) {
			return this.matchWithFilter(() => true);
		}

		// Match based on CWD
		this.setMatchedDir(process.cwd(), true);
		return true;
	}

	public async depcheck(fix: boolean) {
		for (const pkg of this.packages.packages) {
			// Fluid specific
			let checkFiles: string[];
			if (pkg.packageJson.dependencies) {
				const tsFiles = await globFn(`${pkg.directory}/**/*.ts`, {
					ignore: `${pkg.directory}/node_modules/**`,
				});
				const tsxFiles = await globFn(`${pkg.directory}/**/*.tsx`, {
					ignore: `${pkg.directory}/node_modules/**`,
				});
				checkFiles = tsFiles.concat(tsxFiles);
			} else {
				checkFiles = [];
			}

			const npmDepChecker = new NpmDepChecker(pkg, checkFiles);
			if (await npmDepChecker.run(fix)) {
				await pkg.savePackageJson();
			}
		}
	}

	public async symlink(options: ISymlinkOptions) {
		// Only do parallel if we are checking only
		const result = await this.packages.forEachAsync(
			(pkg) => symlinkPackage(this, pkg, this.createPackageMap(), options),
			!options.symlink,
		);
		return Packages.clean(
			result.filter((entry) => entry.count).map((entry) => entry.pkg),
			true,
		);
	}

	public createBuildGraph(options: ISymlinkOptions, buildTargetNames: string[]) {
		return new BuildGraph(
			this.createPackageMap(),
			this.getReleaseGroupPackages(),
			buildTargetNames,
			getFluidBuildConfig(this.resolvedRoot)?.tasks,
			(pkg: Package) => {
				return (dep: Package) => {
					return options.fullSymlink || MonoRepo.isSame(pkg.monoRepo, dep.monoRepo);
				};
			},
		);
	}

	private getReleaseGroupPackages() {
		const releaseGroupPackages: Package[] = [];
		for (const releaseGroup of this.releaseGroups.values()) {
			releaseGroupPackages.push(releaseGroup.pkg);
		}
		return releaseGroupPackages;
	}

	private matchWithFilter(callback: (pkg: Package) => boolean) {
		let matched = false;
		this.packages.packages.forEach((pkg) => {
			if (!pkg.matched && callback(pkg)) {
				this.setMatchedPackage(pkg);
				matched = true;
			}
		});
		return matched;
	}

	private setMatchedDir(dir: string, matchReleaseGroup: boolean) {
		const pkgDir = lookUpDirSync(dir, (currentDir) => {
			return existsSync(path.join(currentDir, "package.json"));
		});
		if (!pkgDir) {
			throw new Error(`Unable to look up package in directory '${dir}'.`);
		}

		for (const releaseGroup of this.releaseGroups.values()) {
			if (isSameFileOrDir(releaseGroup.repoPath, pkgDir)) {
				log(
					`Release group ${chalk.cyanBright(releaseGroup.kind)} matched (directory: ${dir})`,
				);
				this.setMatchedReleaseGroup(releaseGroup);
				return;
			}
		}

		const foundPackage = this.packages.packages.find((pkg) =>
			isSameFileOrDir(pkg.directory, pkgDir),
		);
		if (foundPackage === undefined) {
			throw new Error(
				`Package in '${pkgDir}' not part of the Fluid repo '${this.resolvedRoot}'.`,
			);
		}

		if (matchReleaseGroup && foundPackage.monoRepo !== undefined) {
			log(
				`\tRelease group ${chalk.cyanBright(
					foundPackage.monoRepo.kind,
				)} matched (directory: ${dir})`,
			);
			this.setMatchedReleaseGroup(foundPackage.monoRepo);
		} else {
			log(`\t${foundPackage.nameColored} matched (${dir})`);
			this.setMatchedPackage(foundPackage);
		}
	}

	private setMatchedReleaseGroup(monoRepo: MonoRepo) {
		this.setMatchedPackage(monoRepo.pkg);
	}

	private setMatchedPackage(pkg: Package) {
		traceInit(`${pkg.nameColored}: matched`);
		pkg.setMatched();
	}
}
