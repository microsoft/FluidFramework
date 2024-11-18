/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import * as path from "node:path";

import {
	FluidRepoBase,
	type IPackage,
	type IWorkspace,
	type ReleaseGroupName,
	findGitRootSync,
	getFluidRepoLayout,
} from "@fluid-tools/build-infrastructure";
import registerDebug from "debug";
import chalk from "picocolors";
import { simpleGit } from "simple-git";

import { defaultLogger } from "../common/logging";
import { BuildPackage } from "../common/npmPackage";
import {
	ExecAsyncResult,
	execWithErrorAsync,
	isSameFileOrDir,
	lookUpDirSync,
} from "../common/utils";
import type { BuildContext } from "./buildContext";
import { BuildGraph } from "./buildGraph";
import { getFluidBuildConfig } from "./config";

const traceInit = registerDebug("fluid-build:init");

const { log } = defaultLogger;

export interface IPackageMatchedOptions {
	match: string[];
	all: boolean;
	dirs: string[];
	releaseGroups: string[];
}

export class FluidRepoBuild extends FluidRepoBase<BuildPackage> {
	protected context: BuildContext;

	public constructor(searchPath: string) {
		super(searchPath);
		const { config: fluidBuildConfig } = getFluidBuildConfig(searchPath);
		const { config: fluidRepoLayout } = getFluidRepoLayout(searchPath);

		const gitRoot = findGitRootSync(searchPath);
		this.context = {
			fluidBuildConfig,
			fluidRepoLayout,
			repoRoot: this.root,
			gitRepo: simpleGit(gitRoot),
			gitRoot,
		};
	}

	// public get packages(): Map<PackageName, BuildPackage> {
	// 	const pkgs: Map<PackageName, BuildPackage> = new Map();
	// 	for (const ws of this.workspaces.values()) {
	// 		for (const pkg of ws.packages) {
	// 			if (pkgs.has(pkg.name)) {
	// 				throw new Error(`Duplicate package: ${pkg.name}`);
	// 			}

	// 			const buildPackage = new BuildPackage(pkg);
	// 			pkgs.set(pkg.name, buildPackage);
	// 		}
	// 	}

	// 	return pkgs;
	// }

	public async clean(packages: IPackage[], status: boolean) {
		const cleanP: Promise<ExecAsyncResult>[] = [];
		let numDone = 0;
		const execCleanScript = async (pkg: IPackage, cleanScript: string) => {
			const startTime = Date.now();
			const result = await execWithErrorAsync(
				cleanScript,
				{
					cwd: pkg.directory,
					env: {
						PATH: `${process.env["PATH"]}${path.delimiter}${path.join(
							pkg.directory,
							"node_modules",
							".bin",
						)}`,
					},
				},
				pkg.nameColored,
			);

			if (status) {
				const elapsedTime = (Date.now() - startTime) / 1000;
				log(
					`[${++numDone}/${cleanP.length}] ${
						pkg.nameColored
					}: ${cleanScript} - ${elapsedTime.toFixed(3)}s`,
				);
			}
			return result;
		};
		for (const pkg of packages) {
			const cleanScript = pkg.getScript("clean");
			if (cleanScript) {
				cleanP.push(execCleanScript(pkg, cleanScript));
			}
		}
		const results = await Promise.all(cleanP);
		return !results.some((result) => result.error);
	}

	public static async ensureInstalled(packages: IPackage[]) {
		const installedWorkspaces = new Set<IWorkspace>();
		const installPromises: Promise<boolean>[] = [];
		for (const pkg of packages) {
			if (!installedWorkspaces.has(pkg.workspace)) {
				installedWorkspaces.add(pkg.workspace);
				installPromises.push(pkg.workspace.install(false));
			}
		}
		const rets = await Promise.all(installPromises);
		return !rets.some((result) => !result);
	}

	public async install() {
		return FluidRepoBuild.ensureInstalled([...this.packages.values()]);
	}

	public async uninstall() {
		const cleanPromises: Promise<ExecAsyncResult>[] = [];
		for (const pkg of this.packages.values()) {
			cleanPromises.push(pkg.cleanNodeModules());
		}

		const r = await Promise.all(cleanPromises);
		return !r.some((ret) => ret?.error);
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
				const releaseGroup = this.releaseGroups.get(releaseGroupName as ReleaseGroupName);
				if (releaseGroup === undefined) {
					throw new Error(
						`Release group '${releaseGroupName}' specified is not defined in the repo.`,
					);
				}
				this.setMatchedWorkspace(releaseGroup.workspace);
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

	public createBuildGraph(buildTargetNames: string[]) {
		const { config } = getFluidBuildConfig(this.root);
		return new BuildGraph(
			this.packages,
			[...this.packages.values()],
			this.context,
			buildTargetNames,
			config.tasks,
			(pkg: BuildPackage) => {
				return (dep: BuildPackage) => {
					return pkg.releaseGroup === dep.releaseGroup;
				};
			},
		);
	}

	private matchWithFilter(callback: (pkg: BuildPackage) => boolean) {
		let matched = false;
		[...this.packages.values()].forEach((pkg) => {
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
			if (
				isSameFileOrDir(
					releaseGroup.rootPackage?.directory ?? releaseGroup.workspace.directory,
					pkgDir,
				)
			) {
				log(
					`Release group ${chalk.cyanBright(releaseGroup.name)} matched (directory: ${dir})`,
				);
				this.setMatchedWorkspace(releaseGroup.workspace);
				return;
			}
		}

		const foundPackage = [...this.packages.values()].find((pkg) =>
			isSameFileOrDir(pkg.directory, pkgDir),
		);
		if (foundPackage === undefined) {
			throw new Error(`Package in '${pkgDir}' not part of the Fluid repo '${this.root}'.`);
		}

		if (matchReleaseGroup && foundPackage !== undefined) {
			log(
				`\tRelease group ${chalk.cyanBright(
					foundPackage.releaseGroup,
				)} matched (directory: ${dir})`,
			);
			this.setMatchedWorkspace(foundPackage.workspace);
		} else {
			log(`\t${foundPackage.nameColored} matched (${dir})`);
			this.setMatchedPackage(foundPackage);
		}
	}

	private setMatchedWorkspace(workspace: IWorkspace) {
		const rootPkg = new BuildPackage(workspace.rootPackage);
		this.setMatchedPackage(rootPkg);
	}

	private setMatchedPackage(pkg: BuildPackage) {
		traceInit(`${pkg.nameColored}: matched`);
		pkg.matched = true;
	}
}
