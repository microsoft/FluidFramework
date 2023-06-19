/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { InterdependencyRange, DEFAULT_INTERDEPENDENCY_RANGE } from "@fluid-tools/version-tools";
import { getPackagesSync } from "@manypkg/get-packages";
import { readFileSync, readJsonSync } from "fs-extra";
import * as path from "path";
import YAML from "yaml";

import { IFluidBuildConfig, IFluidRepoPackage } from "./fluidRepo";
import { Logger, defaultLogger } from "./logging";
import { Package, PackageJson } from "./npmPackage";
import { execWithErrorAsync, existsSync, rimrafWithErrorAsync } from "./utils";

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
export class MonoRepo {
	public readonly packages: Package[] = [];
	public readonly version: string;
	public readonly workspaceGlobs: string[];
	private _packageJson: PackageJson;

	static load(group: string, repoPackage: IFluidRepoPackage, log: Logger) {
		const { directory, ignoredDirs, defaultInterdependencyRange } = repoPackage;
		let packageManager: PackageManager;
		let packageDirs: string[];

		try {
			const { tool, rootDir, packages } = getPackagesSync(directory);
			if (path.resolve(rootDir) !== directory) {
				// This is a sanity check. directory is the path passed in when creating the MonoRepo object, while rootDir is
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
			if (packages.length === 1 && packages[0].dir === directory) {
				// this is a independent package
				return undefined;
			}
			packageDirs = packages.filter((pkg) => pkg.relativeDir !== ".").map((pkg) => pkg.dir);

			if (defaultInterdependencyRange === undefined) {
				log?.warning(
					`No defaultinterdependencyRange specified for ${group} release group. Defaulting to "${DEFAULT_INTERDEPENDENCY_RANGE}".`,
				);
			}
		} catch {
			return undefined;
		}

		return new MonoRepo(
			group,
			directory,
			defaultInterdependencyRange ?? DEFAULT_INTERDEPENDENCY_RANGE,
			packageManager,
			packageDirs,
			ignoredDirs,
			log,
		);
	}

	/**
	 * Creates a new monorepo.
	 *
	 * @param kind The 'kind' of monorepo this object represents.
	 * @param repoPath The path on the filesystem to the monorepo. This location is expected to have either a
	 * package.json file with a workspaces field, or a lerna.json file with a packages field.
	 * @param ignoredDirs Paths to ignore when loading the monorepo.
	 */
	constructor(
		public readonly kind: string,
		public readonly repoPath: string,
		public readonly interdependencyRange: InterdependencyRange,
		private readonly packageManager: PackageManager,
		packageDirs: string[],
		ignoredDirs?: string[],
		private readonly logger: Logger = defaultLogger,
	) {
		this.version = "";
		this.workspaceGlobs = [];
		const pnpmWorkspace = path.join(repoPath, "pnpm-workspace.yaml");
		const lernaPath = path.join(repoPath, "lerna.json");
		const yarnLockPath = path.join(repoPath, "yarn.lock");
		const packagePath = path.join(repoPath, "package.json");
		let versionFromLerna = false;

		if (!existsSync(packagePath)) {
			throw new Error(`ERROR: package.json not found in ${repoPath}`);
		}

		this._packageJson = readJsonSync(packagePath);

		const validatePackageManager = existsSync(pnpmWorkspace)
			? "pnpm"
			: existsSync(yarnLockPath)
			? "yarn"
			: "npm";

		if (this.packageManager !== validatePackageManager) {
			throw new Error(
				`Package manager mismatch between ${packageManager} and ${validatePackageManager}`,
			);
		}

		if (existsSync(lernaPath)) {
			const lerna = readJsonSync(lernaPath);
			if (packageManager === "pnpm") {
				const workspaceString = readFileSync(pnpmWorkspace, "utf-8");
				this.workspaceGlobs = YAML.parse(workspaceString).packages;
			} else if (lerna.packages !== undefined) {
				this.workspaceGlobs = lerna.packages;
			}

			if (lerna.version !== undefined) {
				logger.verbose(`${kind}: Loading version (${lerna.version}) from ${lernaPath}`);
				this.version = lerna.version;
				versionFromLerna = true;
			}
		} else {
			// Load globs from package.json directly
			if (this._packageJson.workspaces instanceof Array) {
				this.workspaceGlobs = this._packageJson.workspaces;
			} else {
				this.workspaceGlobs = (this._packageJson.workspaces as any).packages;
			}
		}

		if (!versionFromLerna) {
			this.version = this._packageJson.version;
			logger.verbose(
				`${kind}: Loading version (${this._packageJson.version}) from ${packagePath}`,
			);
		}

		logger.verbose(`${kind}: Loading packages from ${packageManager}`);
		for (const pkgDir of packageDirs) {
			this.packages.push(new Package(path.join(pkgDir, "package.json"), kind, this));
		}
		return;
	}

	public static isSame(a: MonoRepo | undefined, b: MonoRepo | undefined) {
		return a !== undefined && a === b;
	}

	public get installCommand(): string {
		return this.packageManager === "pnpm"
			? "pnpm i"
			: this.packageManager === "yarn"
			? "npm run install-strict"
			: "npm i --no-package-lock --no-shrinkwrap";
	}

	public get fluidBuildConfig(): IFluidBuildConfig | undefined {
		return this._packageJson.fluidBuild;
	}

	public getNodeModulePath() {
		return path.join(this.repoPath, "node_modules");
	}

	public async install() {
		this.logger.info(`${this.kind}: Installing - ${this.installCommand}`);
		return execWithErrorAsync(this.installCommand, { cwd: this.repoPath }, this.repoPath);
	}
	public async uninstall() {
		return rimrafWithErrorAsync(this.getNodeModulePath(), this.repoPath);
	}
}
