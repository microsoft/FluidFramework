/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";
import {
	type IPackage,
	type IPackageManager,
	type PackageName,
	type ReleaseGroupName,
	createPackageManager,
} from "@fluid-tools/build-infrastructure";
import { queue } from "async";
import * as chalk from "chalk";
import detectIndent from "detect-indent";
import { readJsonSync, writeJson, writeJsonSync } from "fs-extra";
import sortPackageJson from "sort-package-json";

import type { SetRequired, PackageJson as StandardPackageJson } from "type-fest";

import { type IFluidBuildConfig } from "../fluidBuild/fluidBuildConfig";
import { options } from "../fluidBuild/options";
import { defaultLogger } from "./logging";
import { MonoRepo } from "./monoRepo";
import {
	ExecAsyncResult,
	execWithErrorAsync,
	isSameFileOrDir,
	lookUpDirSync,
	rimrafWithErrorAsync,
} from "./utils";

import { readFile } from "node:fs/promises";
import registerDebug from "debug";
const traceInit = registerDebug("fluid-build:init");

const { log, errorLog: error } = defaultLogger;

/**
 * A type representing fluid-build-specific config that may be in package.json.
 */
export type FluidPackageJson = {
	/**
	 * nyc config
	 */
	nyc?: any;

	/**
	 * fluid-build config. Some properties only apply when set in the root or release group root package.json.
	 */
	fluidBuild?: IFluidBuildConfig;

	/**
	 * pnpm config
	 */
	pnpm?: {
		overrides?: Record<string, string>;
	};
};

/**
 * A type representing all known fields in package.json, including fluid-build-specific config.
 *
 * By default all fields are optional, but we require that the name, scripts, and version all be defined.
 */
export type PackageJson = SetRequired<
	StandardPackageJson & FluidPackageJson,
	"name" | "scripts" | "version"
>;

/**
 * Information about a package dependency.
 */
interface PackageDependency {
	name: PackageName;
	version: string;
	depClass: "prod" | "dev" | "peer";
}

export interface IFluidBuildPackageJson extends PackageJson {
	fluidBuild?: IFluidBuildConfig;
}

export interface IFluidBuildPackage extends IPackage<IFluidBuildPackageJson> {
	matched?: boolean;

	/**
	 * The MonoRepo class is roughly equivalent to a workspace.
	 */
	readonly monoRepo?: MonoRepo;

	cleanNodeModules(): Promise<ExecAsyncResult>;
	getLockFilePath(): string | undefined;
	install(): Promise<ExecAsyncResult>;

	/**
	 * The deprected "group" of the package.
	 *
	 * @deprecated Do not use.
	 */
	group: string;
}

export class PackageClass implements IFluidBuildPackage {
	private static packageCount: number = 0;
	private static readonly chalkColor = [
		chalk.default.red,
		chalk.default.green,
		chalk.default.yellow,
		chalk.default.blue,
		chalk.default.magenta,
		chalk.default.cyan,
		chalk.default.white,
		chalk.default.grey,
		chalk.default.redBright,
		chalk.default.greenBright,
		chalk.default.yellowBright,
		chalk.default.blueBright,
		chalk.default.magentaBright,
		chalk.default.cyanBright,
		chalk.default.whiteBright,
	];

	private _packageJson: PackageJson;
	private readonly packageId = PackageClass.packageCount++;
	private _matched: boolean = false;

	private _indent: string;
	public readonly packageManager: IPackageManager;
	public get packageJson(): PackageJson {
		return this._packageJson;
	}

	public get packageJsonFilePath() {
		return this.packageJsonFileName;
	}

	/**
	 * Create a new package from a package.json file. Prefer the .load method to calling the contructor directly.
	 *
	 * @param packageJsonFileName - The path to a package.json file.
	 * @param group - A group that this package is a part of.
	 * @param monoRepo - Set this if the package is part of a release group (monorepo).
	 * @param additionalProperties - An object with additional properties that should be added to the class. This is
	 * useful to augment the package class with additional properties.
	 */
	constructor(
		public readonly packageJsonFileName: string,
		public readonly group: string,
		public readonly monoRepo?: MonoRepo,
		additionalProperties: any = {},
	) {
		[this._packageJson, this._indent] = readPackageJsonAndIndent(packageJsonFileName);
		const pnpmWorkspacePath = path.join(this.directory, "pnpm-workspace.yaml");
		const yarnLockPath = path.join(this.directory, "yarn.lock");
		this.packageManager = existsSync(pnpmWorkspacePath)
			? createPackageManager("pnpm")
			: existsSync(yarnLockPath)
				? createPackageManager("yarn")
				: createPackageManager("npm");
		traceInit(`${this.nameColored}: Package loaded`);
		Object.assign(this, additionalProperties);
	}

	public get releaseGroup(): ReleaseGroupName {
		throw new Error(`Not implemented; do not call.`);
	}

	/**
	 * The name of the package including the scope.
	 */
	public get name(): PackageName {
		return this.packageJson.name as PackageName;
	}

	/**
	 * The name of the package with a color for terminal output.
	 */
	public get nameColored(): string {
		return this.color(this.name);
	}

	public get private(): boolean {
		return this.packageJson.private ?? false;
	}

	public get version(): string {
		return this.packageJson.version;
	}

	public get isPublished(): boolean {
		return !this.private;
	}

	public get isTestPackage(): boolean {
		return this.name.split("/")[1]?.startsWith("test-") === true;
	}

	/**
	 * Returns true if the package is a release group root package based on its directory path.
	 */
	public get isReleaseGroupRoot(): boolean {
		// release groups and workspaces are the same in this implementation
		return this.isWorkspaceRoot;
	}

	public get isWorkspaceRoot(): boolean {
		return this.monoRepo !== undefined && this.directory === this.monoRepo.repoPath;
	}

	public get matched() {
		return this._matched;
	}

	public set matched(value) {
		this._matched = value;
	}

	public get dependencies(): PackageName[] {
		return Object.keys(this.packageJson.dependencies ?? {}).map((p) => p as PackageName);
	}

	public get combinedDependencies(): Generator<PackageDependency, void> {
		const it = function* (packageJson: PackageJson) {
			for (const item in packageJson.dependencies) {
				yield {
					name: item as PackageName,
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					version: packageJson.dependencies[item]!,
					depClass: "prod",
				} as const;
			}
			for (const item in packageJson.devDependencies) {
				yield {
					name: item as PackageName,
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					version: packageJson.devDependencies[item]!,
					depClass: "dev",
				} as const;
			}
			for (const item in packageJson.peerDependencies) {
				yield {
					name: item as PackageName,
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					version: packageJson.peerDependencies[item]!,
					depClass: "peer",
				} as const;
			}
		};
		return it(this.packageJson);
	}

	public get directory(): string {
		return path.dirname(this.packageJsonFileName);
	}

	/**
	 * Get the full path for the lock file.
	 * @returns full path for the lock file, or undefined if one doesn't exist
	 */
	public getLockFilePath() {
		const directory = this.monoRepo ? this.monoRepo.repoPath : this.directory;
		const lockFileNames = ["pnpm-lock.yaml", "yarn.lock", "package-lock.json"];
		for (const lockFileName of lockFileNames) {
			const full = path.join(directory, lockFileName);
			if (existsSync(full)) {
				return full;
			}
		}
		return undefined;
	}

	public get installCommand(): string {
		return `${this.packageManager.name} ${this.packageManager.installCommand(false)}`;
	}

	private get color() {
		return PackageClass.chalkColor[this.packageId % PackageClass.chalkColor.length];
	}

	public getScript(name: string): string | undefined {
		return this.packageJson.scripts ? this.packageJson.scripts[name] : undefined;
	}

	public async cleanNodeModules() {
		return rimrafWithErrorAsync(path.join(this.directory, "node_modules"), this.nameColored);
	}

	public async savePackageJson() {
		writePackageJson(this.packageJsonFileName, this.packageJson, this._indent);
	}

	public reload() {
		this._packageJson = readJsonSync(this.packageJsonFileName);
	}

	public async checkInstall(print: boolean = true) {
		if (this.combinedDependencies.next().done) {
			// No dependencies
			return true;
		}

		if (!existsSync(path.join(this.directory, "node_modules"))) {
			if (print) {
				error(`${this.nameColored}: node_modules not installed in ${this.directory}`);
			}
			return false;
		}
		let succeeded = true;
		for (const dep of this.combinedDependencies) {
			if (
				!lookUpDirSync(this.directory, (currentDir) => {
					// TODO: check semver as well
					return existsSync(path.join(currentDir, "node_modules", dep.name));
				})
			) {
				succeeded = false;
				if (print) {
					error(`${this.nameColored}: dependency ${dep.name} not found`);
				}
			}
		}
		return succeeded;
	}

	public async install() {
		if (this.monoRepo) {
			throw new Error("Package in a monorepo shouldn't be installed");
		}

		log(`${this.nameColored}: Installing - ${this.installCommand}`);
		return execWithErrorAsync(this.installCommand, { cwd: this.directory }, this.directory);
	}

	/**
	 * Load a package from a package.json file. Prefer this to calling the contructor directly.
	 *
	 * @param packageJsonFileName - The path to a package.json file.
	 * @param group - A group that this package is a part of.
	 * @param monoRepo - Set this if the package is part of a release group (monorepo).
	 * @param additionalProperties - An object with additional properties that should be added to the class. This is
	 * useful to augment the package class with additional properties.
	 *
	 * @deprecated Use of this function outside the build-tools package is deprecated.
	 */
	public static load<T extends typeof PackageClass, TAddProps>(
		this: T,
		packageJsonFileName: string,
		group: string,
		monoRepo?: MonoRepo,
		additionalProperties?: TAddProps,
	) {
		return new this(
			packageJsonFileName,
			group,
			monoRepo,
			additionalProperties,
		) as InstanceType<T> & TAddProps;
	}

	/**
	 * Load a package from directory containing a package.json.
	 *
	 * @param packageDir - The path to a package.json file.
	 * @param group - A group that this package is a part of.
	 * @param monoRepo - Set this if the package is part of a release group (monorepo).
	 * @param additionalProperties - An object with additional properties that should be added to the class. This is
	 * useful to augment the package class with additional properties.
	 * @typeParam TAddProps - The type of the additional properties object.
	 * @returns a loaded Package. If additional properties are specifed, the returned type will be Package & TAddProps.
	 *
	 * @deprecated Use of this function outside the build-tools package is deprecated.
	 */
	public static loadDir<T extends typeof PackageClass, TAddProps>(
		this: T,
		packageDir: string,
		group: string,
		monoRepo?: MonoRepo,
		additionalProperties?: TAddProps,
	) {
		return PackageClass.load(
			path.join(packageDir, "package.json"),
			group,
			monoRepo,
			additionalProperties,
		) as InstanceType<T> & TAddProps;
	}
}

interface TaskExec<TItem, TResult> {
	item: TItem;
	resolve: (result: TResult) => void;
	reject: (reason?: any) => void;
}

async function queueExec<TItem, TResult>(
	items: Iterable<TItem>,
	exec: (item: TItem) => Promise<TResult>,
	messageCallback?: (item: TItem) => string,
) {
	let numDone = 0;
	const timedExec = messageCallback
		? async (item: TItem) => {
				const startTime = Date.now();
				const result = await exec(item);
				const elapsedTime = (Date.now() - startTime) / 1000;
				log(
					`[${++numDone}/${p.length}] ${messageCallback(item)} - ${elapsedTime.toFixed(3)}s`,
				);
				return result;
			}
		: exec;
	const q = queue(async (taskExec: TaskExec<TItem, TResult>) => {
		try {
			taskExec.resolve(await timedExec(taskExec.item));
		} catch (e) {
			taskExec.reject(e);
		}
	}, options.concurrency);
	const p: Promise<TResult>[] = [];
	for (const item of items) {
		p.push(new Promise<TResult>((resolve, reject) => q.push({ item, resolve, reject })));
	}
	return Promise.all(p);
}

export class Packages {
	public constructor(public readonly packages: IFluidBuildPackage[]) {}

	public static loadDir(
		dirFullPath: string,
		group: string,
		ignoredDirFullPaths: string[] | undefined,
		monoRepo?: MonoRepo,
	) {
		const packageJsonFileName = path.join(dirFullPath, "package.json");
		if (existsSync(packageJsonFileName)) {
			return [PackageClass.load(packageJsonFileName, group, monoRepo)];
		}

		const packages: IFluidBuildPackage[] = [];
		const files = readdirSync(dirFullPath, { withFileTypes: true });
		files.map((dirent) => {
			if (dirent.isDirectory() && dirent.name !== "node_modules") {
				const fullPath = path.join(dirFullPath, dirent.name);
				if (
					ignoredDirFullPaths === undefined ||
					!ignoredDirFullPaths.some((name) => isSameFileOrDir(name, fullPath))
				) {
					packages.push(...Packages.loadDir(fullPath, group, ignoredDirFullPaths, monoRepo));
				}
			}
		});
		return packages;
	}

	public async cleanNodeModules() {
		return this.queueExecOnAllPackage((pkg) => pkg.cleanNodeModules(), "rimraf node_modules");
	}

	public async forEachAsync<TResult>(
		exec: (pkg: IFluidBuildPackage) => Promise<TResult>,
		parallel: boolean,
		message?: string,
	) {
		if (parallel) {
			return this.queueExecOnAllPackageCore(exec, message);
		}

		const results: TResult[] = [];
		for (const pkg of this.packages) {
			results.push(await exec(pkg));
		}
		return results;
	}

	public static async clean(packages: IPackage[], status: boolean) {
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

	private async queueExecOnAllPackageCore<TResult>(
		exec: (pkg: IFluidBuildPackage) => Promise<TResult>,
		message?: string,
	) {
		const messageCallback = message
			? (pkg: IFluidBuildPackage) => ` ${pkg.nameColored}: ${message}`
			: undefined;
		return queueExec(this.packages, exec, messageCallback);
	}

	private async queueExecOnAllPackage(
		exec: (pkg: IFluidBuildPackage) => Promise<ExecAsyncResult>,
		message?: string,
	) {
		const results = await this.queueExecOnAllPackageCore(exec, message);
		return !results.some((result) => result.error);
	}
}

/**
 * Reads the contents of package.json, applies a transform function to it, then writes the results back to the source
 * file.
 *
 * @param packagePath - A path to a package.json file or a folder containing one. If the path is a directory, the
 * package.json from that directory will be used.
 * @param packageTransformer - A function that will be executed on the package.json contents before writing it
 * back to the file.
 *
 * @remarks
 *
 * The package.json is always sorted using sort-package-json.
 *
 * @internal
 */
export function updatePackageJsonFile(
	packagePath: string,
	packageTransformer: (json: PackageJson) => void,
): void {
	packagePath = packagePath.endsWith("package.json")
		? packagePath
		: path.join(packagePath, "package.json");
	const [pkgJson, indent] = readPackageJsonAndIndent(packagePath);

	// Transform the package.json
	packageTransformer(pkgJson);

	writePackageJson(packagePath, pkgJson, indent);
}

/**
 * Reads a package.json file from a path, detects its indentation, and returns both the JSON as an object and
 * indentation.
 *
 * @internal
 */
export function readPackageJsonAndIndent(
	pathToJson: string,
): [json: PackageJson, indent: string] {
	const contents = readFileSync(pathToJson).toString();
	const indentation = detectIndent(contents).indent || "\t";
	const pkgJson: PackageJson = JSON.parse(contents);
	return [pkgJson, indentation];
}

/**
 * Writes a PackageJson object to a file using the provided indentation.
 */
function writePackageJson(packagePath: string, pkgJson: PackageJson, indent: string) {
	return writeJsonSync(packagePath, sortPackageJson(pkgJson), { spaces: indent });
}

/**
 * Reads the contents of package.json, applies a transform function to it, then writes
 * the results back to the source file.
 *
 * @param packagePath - A path to a package.json file or a folder containing one. If the
 * path is a directory, the package.json from that directory will be used.
 * @param packageTransformer - A function that will be executed on the package.json
 * contents before writing it back to the file.
 *
 * @remarks
 * The package.json is always sorted using sort-package-json.
 *
 * @internal
 */
export async function updatePackageJsonFileAsync(
	packagePath: string,
	packageTransformer: (json: PackageJson) => Promise<void>,
): Promise<void> {
	packagePath = packagePath.endsWith("package.json")
		? packagePath
		: path.join(packagePath, "package.json");
	const [pkgJson, indent] = await readPackageJsonAndIndentAsync(packagePath);

	// Transform the package.json
	await packageTransformer(pkgJson);

	await writeJson(packagePath, sortPackageJson(pkgJson), { spaces: indent });
}

/**
 * Reads a package.json file from a path, detects its indentation, and returns both the JSON as an object and
 * indentation.
 */
async function readPackageJsonAndIndentAsync(
	pathToJson: string,
): Promise<[json: PackageJson, indent: string]> {
	return readFile(pathToJson, { encoding: "utf8" }).then((contents) => {
		const indentation = detectIndent(contents).indent || "\t";
		const pkgJson: PackageJson = JSON.parse(contents);
		return [pkgJson, indentation];
	});
}
