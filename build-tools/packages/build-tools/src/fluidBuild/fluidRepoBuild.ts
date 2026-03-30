/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import * as path from "node:path";

import registerDebug from "debug";
import chalk from "picocolors";

import { defaultLogger } from "../common/logging";
import {
	execWithErrorAsync,
	isSameFileOrDir,
	lookUpDirSync,
	rimrafWithErrorAsync,
} from "../common/utils";
import type { BuildContext } from "./buildContext";
import { BuildGraph } from "./buildGraph";
import type { BuildInfraProject, BuildInfraReleaseGroup } from "./buildInfraTypes";
import { FluidBuildPackage } from "./fluidBuildPackage";
import { getFluidBuildConfig } from "./fluidUtils";

const traceInit = registerDebug("fluid-build:init");

const { log } = defaultLogger;

export interface IPackageMatchedOptions {
	match: string[];
	all: boolean;
	dirs: string[];
	releaseGroups: string[];
}

export class FluidRepoBuild {
	public readonly packages: FluidBuildPackage[];
	private readonly packagesByName: Map<string, FluidBuildPackage>;
	private readonly releaseGroupsByName: Map<string, BuildInfraReleaseGroup>;

	public constructor(
		public readonly buildProject: BuildInfraProject,
		protected context: BuildContext,
	) {
		this.releaseGroupsByName = new Map<string, BuildInfraReleaseGroup>();
		for (const [rgName, rg] of buildProject.releaseGroups) {
			this.releaseGroupsByName.set(rgName, rg);
		}

		this.packagesByName = new Map<string, FluidBuildPackage>();
		this.packages = [];
		for (const [, pkg] of buildProject.packages) {
			const releaseGroupObj = this.releaseGroupsByName.get(pkg.releaseGroup);
			const fbPkg = new FluidBuildPackage(pkg, releaseGroupObj);
			this.packages.push(fbPkg);
			this.packagesByName.set(fbPkg.name, fbPkg);
		}
	}

	public get resolvedRoot(): string {
		return this.buildProject.root;
	}

	public async clean(): Promise<boolean> {
		const cleanPromises: Promise<{ error?: unknown }>[] = [];
		for (const pkg of this.packages) {
			const cleanScript = pkg.getScript("clean");
			if (cleanScript) {
				cleanPromises.push(
					execWithErrorAsync(
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
					),
				);
			}
		}
		const results = await Promise.all(cleanPromises);
		return !results.some((result) => result.error);
	}

	public async uninstall(): Promise<boolean> {
		const removePromises: Promise<{ error?: unknown }>[] = [];

		// Remove node_modules for each package
		for (const pkg of this.packages) {
			removePromises.push(
				rimrafWithErrorAsync(path.join(pkg.directory, "node_modules"), pkg.nameColored),
			);
		}

		// Remove node_modules for each workspace root
		for (const [, workspace] of this.buildProject.workspaces) {
			removePromises.push(
				rimrafWithErrorAsync(path.join(workspace.directory, "node_modules"), workspace.name),
			);
		}

		const results = await Promise.all(removePromises);
		return !results.some((result) => result.error);
	}

	public async install(): Promise<boolean> {
		const installedWorkspaces = new Set<string>();
		for (const [, workspace] of this.buildProject.workspaces) {
			if (!installedWorkspaces.has(workspace.directory)) {
				installedWorkspaces.add(workspace.directory);
				const success = await workspace.install(true);
				if (!success) {
					return false;
				}
			}
		}
		return true;
	}

	public setMatched(options: IPackageMatchedOptions): boolean {
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
				const releaseGroup = this.releaseGroupsByName.get(releaseGroupName);
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

	public createBuildGraph(buildTargetNames: string[]): BuildGraph {
		return new BuildGraph(
			this.createPackageMap(),
			this.getReleaseGroupPackages(),
			this.context,
			buildTargetNames,
			getFluidBuildConfig(this.resolvedRoot)?.tasks,
			(pkg: FluidBuildPackage) => {
				return (dep: FluidBuildPackage) => {
					return pkg.releaseGroup === dep.releaseGroup;
				};
			},
		);
	}

	public createPackageMap(): Map<string, FluidBuildPackage> {
		return new Map(this.packagesByName);
	}

	public relativeToRepo(p: string): string {
		return path.relative(this.resolvedRoot, p).replace(/\\/g, "/");
	}

	private getReleaseGroupPackages(): FluidBuildPackage[] {
		const releaseGroupPackages: FluidBuildPackage[] = [];
		for (const [, releaseGroup] of this.releaseGroupsByName) {
			if (releaseGroup.rootPackage) {
				const fbPkg = this.packagesByName.get(releaseGroup.rootPackage.name);
				if (fbPkg) {
					releaseGroupPackages.push(fbPkg);
				}
			}
		}
		return releaseGroupPackages;
	}

	private matchWithFilter(callback: (pkg: FluidBuildPackage) => boolean): boolean {
		let matched = false;
		this.packages.forEach((pkg) => {
			if (!pkg.matched && callback(pkg)) {
				this.setMatchedPackage(pkg);
				matched = true;
			}
		});
		return matched;
	}

	private setMatchedDir(dir: string, matchReleaseGroup: boolean): void {
		const pkgDir = lookUpDirSync(dir, (currentDir) => {
			return existsSync(path.join(currentDir, "package.json"));
		});
		if (!pkgDir) {
			throw new Error(`Unable to look up package in directory '${dir}'.`);
		}

		for (const [, releaseGroup] of this.releaseGroupsByName) {
			if (isSameFileOrDir(releaseGroup.workspace.directory, pkgDir)) {
				log(
					`Release group ${chalk.cyanBright(releaseGroup.name)} matched (directory: ${dir})`,
				);
				this.setMatchedReleaseGroup(releaseGroup);
				return;
			}
		}

		const foundPackage = this.packages.find((pkg) => isSameFileOrDir(pkg.directory, pkgDir));
		if (foundPackage === undefined) {
			throw new Error(
				`Package in '${pkgDir}' not part of the Fluid repo '${this.resolvedRoot}'.`,
			);
		}

		if (matchReleaseGroup && foundPackage.releaseGroupObj !== undefined) {
			log(
				`\tRelease group ${chalk.cyanBright(
					foundPackage.releaseGroup,
				)} matched (directory: ${dir})`,
			);
			this.setMatchedReleaseGroup(foundPackage.releaseGroupObj);
		} else {
			log(`\t${foundPackage.nameColored} matched (${dir})`);
			this.setMatchedPackage(foundPackage);
		}
	}

	private setMatchedReleaseGroup(releaseGroup: BuildInfraReleaseGroup): void {
		if (releaseGroup.rootPackage) {
			const rootPkg = this.packagesByName.get(releaseGroup.rootPackage.name);
			if (rootPkg) {
				this.setMatchedPackage(rootPkg);
			}
		}
	}

	private setMatchedPackage(pkg: FluidBuildPackage): void {
		traceInit(`${pkg.nameColored}: matched`);
		pkg.setMatched();
	}
}
