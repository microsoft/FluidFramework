/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import {
	DEFAULT_INTERDEPENDENCY_RANGE,
	InterdependencyRange,
} from "@fluid-tools/version-tools";
import { getPackagesSync } from "@manypkg/get-packages";
import { readFileSync, readJsonSync } from "fs-extra";
import YAML from "yaml";

import { ReleaseGroupDefinition, WorkspaceDefinition } from "./fluidRepo";
import { Logger, defaultLogger } from "./logging";
import { Package } from "./npmPackage";
import { execWithErrorAsync, existsSync, rimrafWithErrorAsync } from "./utils";

import registerDebug from "debug";
import { getGitRoot } from "./gitRepo";
const traceInit = registerDebug("fluid-build:init");

export type PackageManager = "npm" | "pnpm" | "yarn";

/**
 * A monorepo is a collection of packages that are versioned and released together.
 *
 * @remarks
 *
 * A monorepo is configured using either package.json or lerna.json. The files are checked in the following way:
 *
 * - If lerna.json exists, it is checked for a `packages` AND a `version` field.
 *
 * - If lerna.json contains BOTH of those fields, then the values in lerna.json will be used. Package.json will not be
 *   read.
 *
 * - If lerna.json contains ONLY the version field, it will be used.
 *
 * - Otherwise, if package.json exists, it is checked for a `workspaces` field and a `version` field.
 *
 * - If package.json contains a workspaces field, then packages will be loaded based on the globs in that field.
 *
 * - If the version was not defined in lerna.json, then the version value in package.json will be used.
 */
export class Workspace {
	public readonly packages: Package[] = [];
	public readonly version: string;
	public readonly workspaceGlobs: string[];
	public readonly pkg: Package;

	// public get name(): string {
	// 	return this.kind;
	// }

	/**
	 * The directory of the root of the release group.
	 */
	public get directory(): string {
		return this.workspacePath;
	}

	// /**
	//  * @deprecated Use the releaseGroups (plural) property instead.
	//  */
	// public get releaseGroup(): "build-tools" | "client" | "server" | "gitrest" | "historian" {
	// 	return this.name as "build-tools" | "client" | "server" | "gitrest" | "historian";
	// }

	private _releaseGroups: Map<string, Package[]> | undefined;
	public get releaseGroups(): Map<string, Package[]> {
		if (this._releaseGroups === undefined) {
			this._releaseGroups = new Map<string, Package[]>();

			for (const pkg of this.packages) {
				if (pkg.releaseGroup !== undefined) {
					const entry = this._releaseGroups.get(pkg.releaseGroup) ?? [];
					entry.push(pkg);
					this._releaseGroups.set(pkg.releaseGroup, entry);
				}
			}
		}
		return this._releaseGroups;
	}

	public get releaseGroupNames(): Set<string> {
		return new Set(this.releaseGroups.keys());
	}

	public get independentPackages(): Package[] {
		return this.packages.filter((pkg) => pkg.isIndependentPackage);
	}

	static load(name: string, workspaceDefinition: WorkspaceDefinition): Workspace {
		const { directory: relDirectory, defaultInterdependencyRange } = workspaceDefinition;
		const directory = path.resolve(getGitRoot(), relDirectory);
		let packageManager: PackageManager;

		// Use manypkg to enumerate the packages in the workspace based on the workspace definition
		const { tool, rootDir, packages } = getPackagesSync(directory);
		if (path.resolve(rootDir) !== directory) {
			// This is a sanity check. directory is the path passed in when creating the Workspace object, while rootDir is
			// the dir that manypkg found. They should be the same.
			throw new Error(`rootDir ${rootDir} does not match repoPath ${directory}`);
		}
		switch (tool.type) {
			case "lerna":
				// Treat lerna as "npm"
				packageManager = "npm";
				break;
			case "npm":
			case "pnpm":
			case "yarn":
				packageManager = tool.type;
				break;
			default:
				throw new Error(`Unknown package manager ${tool.type}`);
		}
		// if (packages.length === 1 && packages[0].dir === directory) {
		// 	// this is a independent package
		// 	return undefined;
		// }

		// Convert the list of packages to a list of package directories relative to the workspace root.
		const packageDirs = packages
			.filter((pkg) => pkg.relativeDir !== ".")
			.map((pkg) => pkg.dir);

		if (defaultInterdependencyRange === undefined) {
			traceInit(
				`No defaultinterdependencyRange specified for ${name} workspace. Defaulting to "${DEFAULT_INTERDEPENDENCY_RANGE}".`,
			);
		}
		// }
		// // catch {
		// // 	return undefined;
		// // }

		// if (releaseGroups !== undefined) {
		// 	for (const rgName of Object.keys(releaseGroups)) {
		// 		const releaseGroup = rgName;
		// 	}
		// }

		return new Workspace(
			name,
			directory,
			defaultInterdependencyRange ?? DEFAULT_INTERDEPENDENCY_RANGE,
			packageManager,
			packageDirs,
			workspaceDefinition,
			// ignoredDirs,
		);
	}

	/**
	 * Creates a new workspace.
	 *
	 * @param kind The name of the workspace.
	 * @param workspacePath The path on the filesystem to the workspace. This location is expected to have a
	 * workspaces configuration file (pnpm-workspace.yaml).
	 */
	constructor(
		public readonly name: string,
		public readonly workspacePath: string,
		public readonly interdependencyRange: InterdependencyRange,
		private readonly packageManager: PackageManager,
		packageDirs: string[],
		workspaceDefinition: WorkspaceDefinition,
		// ignoredDirs?: string[],
		private readonly logger: Logger = defaultLogger,
	) {
		this.version = "";
		this.workspaceGlobs = [];

		const packagePath = path.join(workspacePath, "package.json");
		let versionFromLerna = false;

		if (!existsSync(packagePath)) {
			throw new Error(`ERROR: package.json not found in ${workspacePath}`);
		}

		this.pkg = Package.load(packagePath, this);

		if (this.packageManager !== this.pkg.packageManager) {
			throw new Error(
				`Package manager mismatch between ${packageManager} and ${this.pkg.packageManager}`,
			);
		}

		const rgMap = new Map<string, ReleaseGroupDefinition>(
			Object.entries(workspaceDefinition.releaseGroups ?? {}),
		);
		// for(const [rgName, rgDef] of Object.entries(workspaceDefinition.releaseGroups ??{})) {
		// 	m.set(rgName, rgDef)
		// }

		for (const pkgDir of packageDirs) {
			traceInit(`${name} (workspace): Loading packages from ${pkgDir}`);
			this.packages.push(Package.load(pkgDir, this, rgMap));
		}

		if (packageManager === "pnpm") {
			const pnpmWorkspace = path.join(this.directory, "pnpm-workspace.yaml");
			const workspaceString = readFileSync(pnpmWorkspace, "utf-8");
			this.workspaceGlobs = YAML.parse(workspaceString).packages;
		}

		// only needed for bump tools
		const lernaPath = path.join(workspacePath, "lerna.json");
		if (existsSync(lernaPath)) {
			const lerna = readJsonSync(lernaPath);
			if (packageManager === "pnpm") {
				const pnpmWorkspace = path.join(workspacePath, "pnpm-workspace.yaml");
				const workspaceString = readFileSync(pnpmWorkspace, "utf-8");
				this.workspaceGlobs = YAML.parse(workspaceString).packages;
			} else if (lerna.packages !== undefined) {
				this.workspaceGlobs = lerna.packages;
			}

			if (lerna.version !== undefined) {
				traceInit(`${name} (workspace): Loading version (${lerna.version}) from ${lernaPath}`);
				this.version = lerna.version;
				versionFromLerna = true;
			}
		} else if (packageManager !== "pnpm") {
			// Load globs from package.json directly
			if (this.pkg.packageJson.workspaces instanceof Array) {
				this.workspaceGlobs = this.pkg.packageJson.workspaces;
			} else {
				this.workspaceGlobs = (this.pkg.packageJson.workspaces as any).packages;
			}
		}

		if (!versionFromLerna) {
			this.version = this.pkg.packageJson.version;
			traceInit(
				`${name} (workspace): Loading version (${this.pkg.packageJson.version}) from ${packagePath}`,
			);
		}
	}

	public static isSame(a: Workspace | undefined, b: Workspace | undefined) {
		return a !== undefined && a === b;
	}

	public get installCommand(): string {
		return this.packageManager === "pnpm"
			? "pnpm i"
			: this.packageManager === "yarn"
				? "yarn"
				: "npm i --no-package-lock --no-shrinkwrap";
	}

	// public get fluidBuildConfig(): IFluidBuildConfig | undefined {
	// 	return this.pkg.packageJson.fluidBuild;
	// }

	public getNodeModulePath() {
		return path.join(this.workspacePath, "node_modules");
	}

	public async install() {
		this.logger.log(`Workspace ${this.name}: Installing - ${this.installCommand}`);
		return execWithErrorAsync(
			this.installCommand,
			{ cwd: this.workspacePath },
			this.workspacePath,
		);
	}
	public async uninstall() {
		return rimrafWithErrorAsync(this.getNodeModulePath(), this.workspacePath);
	}
}

// export class ReleaseGroup {
// 	constructor(
// 		public readonly name: string,
// 		public readonly workspace: Workspace,
// 	) {}

// 	public static applyReleaseGroupDefinition(
// 		workspace: Workspace,
// 		definition: ReleaseGroupDefinition,
// 	) {
// 		const { include, exclude } = definition;

// 		// const packages = workspace.packages.filter((pkg) => {

// 		// })

// 		for(const pkg of workspace.packages) {
// 			let tagged = false;
// 			if(include.includes(pkg.scope)) {
// 				if(pkg.releaseGroup !== undefined) {
// 					console.warn(`${pkg.nameColored} already has release group "${pkg.releaseGroup}" (trying to apply "${})`)
// 				}
// 			}
// 		}

// 		for(const pkgOrScope of packageOrScopes) {
// 			const isScope = pkgOrScope.startsWith("@") && !pkgOrScope.includes("/");
// 			if(isScope) {

// 			} else {

// 			}
// 		}

// 		for (const pkg of workspace.packages) {
// 		}
// 	}
// }
