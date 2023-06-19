/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as path from "path";
import chalk from "chalk";
import { FluidRepo } from "../common/fluidRepo";
import { getFluidBuildConfig } from "../common/fluidUtils";
import { defaultLogger } from "../common/logging";
import { MonoRepo } from "../common/monoRepo";
import { Package, Packages } from "../common/npmPackage";
import {
	existsSync,
	globFn,
	isSameFileOrDir,
	lookUpDirSync,
	ExecAsyncResult,
} from "../common/utils";
import { BuildGraph } from "./buildGraph";
import { FluidPackageCheck } from "./fluidPackageCheck";
import { NpmDepChecker } from "./npmDepChecker";
import { ISymlinkOptions, symlinkPackage } from "./symlinkUtils";

const { log, verbose } = defaultLogger;

export interface IPackageMatchedOptions {
	match: string[];
	all: boolean;
	dirs: string[];
	releaseGroups: string[];
}

/** Packages in this list will not have their scripts checked for conformance with repo standards. */
const uncheckedPackages = [
	"@fluid-internal/build-cli",
	"@fluid-internal/version-tools",
	"@fluid-tools/build-cli",
	"@fluid-tools/version-tools",
	"@fluidframework/build-tools",
	"@fluidframework/eslint-config-fluid",
];

export class FluidRepoBuild extends FluidRepo {
	constructor(resolvedRoot: string) {
		super(resolvedRoot);
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

			options.releaseGroups.forEach((releaseGroup) => {
				if (!this.matchWithFilter((pkg) => pkg.monoRepo?.kind === releaseGroup)) {
					throw new Error(
						`Release group '${releaseGroup}' specified is not defined in the repo.`,
					);
				}
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

	public async checkPackages(fix: boolean) {
		for (const pkg of this.packages.packages) {
			if (!pkg.matched) {
				// Only check package that matched to build
				continue;
			}
			// TODO: Make this configurable and/or teach fluid-build about new scripts

			if (uncheckedPackages.includes(pkg.name)) {
				verbose(`Skipping ${pkg.nameColored} because it's ignored.`);
				continue;
			}
			if (FluidPackageCheck.checkScripts(pkg, fix)) {
				await pkg.savePackageJson();
			}
			await FluidPackageCheck.checkNpmIgnore(pkg, fix);
			await FluidPackageCheck.checkTsConfig(pkg, fix);
			await FluidPackageCheck.checkTestDir(pkg, fix);
		}
	}
	public async depcheck() {
		for (const pkg of this.packages.packages) {
			// Fluid specific
			let checkFiles: string[];
			if (pkg.packageJson.dependencies) {
				const tsFiles = await globFn(`${pkg.directory}/**/*.ts`, {
					ignore: `${pkg.directory}/node_modules`,
				});
				const tsxFiles = await globFn(`${pkg.directory}/**/*.tsx`, {
					ignore: `${pkg.directory}/node_modules`,
				});
				checkFiles = tsFiles.concat(tsxFiles);
			} else {
				checkFiles = [];
			}

			const npmDepChecker = new NpmDepChecker(pkg, checkFiles);
			if (await npmDepChecker.run()) {
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
			buildTargetNames,
			getFluidBuildConfig(this.resolvedRoot)?.tasks,
			(pkg: Package) => {
				return (dep: Package) => {
					return options.fullSymlink || MonoRepo.isSame(pkg.monoRepo, dep.monoRepo);
				};
			},
		);
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

	private setMatchedDir(dir: string, matchMonoRepo: boolean) {
		const pkgDir = lookUpDirSync(dir, (currentDir) => {
			return existsSync(path.join(currentDir, "package.json"));
		});
		if (!pkgDir) {
			throw new Error(`Unable to look up package in directory '${dir}'.`);
		}

		for (const monoRepo of this.releaseGroups.values()) {
			if (isSameFileOrDir(monoRepo.repoPath, pkgDir)) {
				log(`Release group ${chalk.cyanBright(monoRepo.kind)} matched (directory: ${dir})`);
				this.setMatchedMonoRepo(monoRepo);
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

		if (matchMonoRepo && foundPackage.monoRepo !== undefined) {
			log(
				`\tRelease group ${chalk.cyanBright(
					foundPackage.monoRepo.kind,
				)} matched (directory: ${dir})`,
			);
			this.setMatchedMonoRepo(foundPackage.monoRepo);
		} else {
			log(`\t${foundPackage.nameColored} matched (${dir})`);
			this.setMatchedPackage(foundPackage);
		}
	}

	private setMatchedMonoRepo(monoRepo: MonoRepo) {
		if (!this.matchWithFilter((pkg) => MonoRepo.isSame(pkg.monoRepo, monoRepo))) {
			throw new Error(`Release group '${monoRepo.kind}' does not have any packages`);
		}
	}

	private setMatchedPackage(pkg: Package) {
		verbose(`${pkg.nameColored}: matched`);
		pkg.setMatched();
	}
}
