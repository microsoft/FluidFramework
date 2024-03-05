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
import { Package } from "./npmPackage";
import { execWithErrorAsync, existsSync, rimrafWithErrorAsync } from "./utils";

import registerDebug from "debug";
const traceInit = registerDebug("fluid-build:init");

export type PackageManager = "npm" | "pnpm" | "yarn";

/**
 * Represents the different types of release groups supported by the build tools. Each of these groups should be defined
 * in the fluid-build section of the root package.json.
 * @deprecated
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
 * @deprecated
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
 * An iterator that returns only the Enum values of MonoRepoKind.
 * @deprecated
 */
export function* supportedMonoRepoValues(): IterableIterator<MonoRepoKind> {
	for (const [, flag] of Object.entries(MonoRepoKind)) {
		yield flag;
	}
}

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
	public readonly pkg: Package;

	public get name(): string {
		return this.kind;
	}

	/**
	 * The directory of the root of the release group.
	 */
	public get directory(): string {
		return this.repoPath;
	}

	public get releaseGroup(): "build-tools" | "client" | "server" | "gitrest" | "historian" {
		return this.kind as "build-tools" | "client" | "server" | "gitrest" | "historian";
	}

	static load(group: string, repoPackage: IFluidRepoPackage) {
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
				traceInit(
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

		const packagePath = path.join(repoPath, "package.json");
		let versionFromLerna = false;

		if (!existsSync(packagePath)) {
			throw new Error(`ERROR: package.json not found in ${repoPath}`);
		}

		this.pkg = Package.load(packagePath, kind, this);

		if (this.packageManager !== this.pkg.packageManager) {
			throw new Error(
				`Package manager mismatch between ${packageManager} and ${this.pkg.packageManager}`,
			);
		}

		for (const pkgDir of packageDirs) {
			traceInit(`${kind}: Loading packages from ${pkgDir}`);
			this.packages.push(Package.load(path.join(pkgDir, "package.json"), kind, this));
		}

		if (packageManager === "pnpm") {
			const pnpmWorkspace = path.join(repoPath, "pnpm-workspace.yaml");
			const workspaceString = readFileSync(pnpmWorkspace, "utf-8");
			this.workspaceGlobs = YAML.parse(workspaceString).packages;
		}

		// only needed for bump tools
		const lernaPath = path.join(repoPath, "lerna.json");
		if (existsSync(lernaPath)) {
			const lerna = readJsonSync(lernaPath);
			if (packageManager !== "pnpm" && lerna.packages !== undefined) {
				this.workspaceGlobs = lerna.packages;
			}

			if (lerna.version !== undefined) {
				traceInit(`${kind}: Loading version (${lerna.version}) from ${lernaPath}`);
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
				`${kind}: Loading version (${this.pkg.packageJson.version}) from ${packagePath}`,
			);
		}
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
		return this.pkg.packageJson.fluidBuild;
	}

	public getNodeModulePath() {
		return path.join(this.repoPath, "node_modules");
	}

	public async install() {
		this.logger.log(`Release group ${this.kind}: Installing - ${this.installCommand}`);
		return execWithErrorAsync(this.installCommand, { cwd: this.repoPath }, this.repoPath);
	}
	public async uninstall() {
		return rimrafWithErrorAsync(this.getNodeModulePath(), this.repoPath);
	}
}
