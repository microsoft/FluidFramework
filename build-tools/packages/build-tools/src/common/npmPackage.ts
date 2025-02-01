/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import {
	type PackageJson as BasePackageJson,
	type IBuildProject,
	type IPackage,
	type IReleaseGroup,
	type IWorkspace,
	PackageBase,
	type ReleaseGroupName,
} from "@fluid-tools/build-infrastructure";
import registerDebug from "debug";
import detectIndent from "detect-indent";
import { writeJson, writeJsonSync } from "fs-extra";
import sortPackageJson from "sort-package-json";

import type { SetRequired, PackageJson as StandardPackageJson } from "type-fest";

import { type IFluidBuildConfig } from "../fluidBuild/fluidBuildConfig";
import { rimrafWithErrorAsync } from "./utils";

const traceInit = registerDebug("fluid-build:init");

/**
 * A type representing fluid-build-specific config that may be in package.json.
 *
 * @deprecated Use the types in build-infrastructure instead.
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
 *
 * @deprecated Use the types in build-infrastructure instead.
 */
export type PackageJson = SetRequired<
	StandardPackageJson & FluidPackageJson,
	"name" | "scripts" | "version"
>;

export interface FluidBuildPackageJson extends BasePackageJson {
	fluidBuild?: IFluidBuildConfig;
}

export class BuildPackage extends PackageBase<FluidBuildPackageJson> {
	private _matched: boolean = false;

	/**
	 * Create a new package from a package.json file. Prefer the .load method to calling the contructor directly.
	 *
	 * @param packageJsonFileName - The path to a package.json file.
	 * @param group - A group that this package is a part of.
	 * @param monoRepo - Set this if the package is part of a release group (monorepo).
	 * @param additionalProperties - An object with additional properties that should be added to the class. This is
	 * useful to augment the package class with additional properties.
	 */
	constructor(packageInput: IPackage) {
		const {
			packageJsonFilePath,
			packageManager,
			workspace,
			isWorkspaceRoot,
			releaseGroup,
			isReleaseGroupRoot,
		} = packageInput;
		super(
			packageJsonFilePath,
			packageManager,
			workspace,
			isWorkspaceRoot,
			releaseGroup,
			isReleaseGroupRoot,
		);
		traceInit(`${this.nameColored}: Package loaded`);
		this.monoRepo = isWorkspaceRoot
			? new MonoRepo(releaseGroup, path.basename(packageJsonFilePath), releaseGroup, workspace)
			: undefined;
	}

	public get matched() {
		return this._matched;
	}

	public set matched(value) {
		this._matched = value;
	}

	/**
	 * Get the full path for the lock file.
	 * @returns full path for the lock file, or undefined if one doesn't exist
	 */
	public getLockFilePath() {
		const directory = this.workspace.directory;
		const lockfileName = this.packageManager.lockfileName;
		const full = path.join(directory, lockfileName);
		if (existsSync(full)) {
			return full;
		}
		return undefined;
	}

	public async cleanNodeModules() {
		return rimrafWithErrorAsync(path.join(this.directory, "node_modules"), this.nameColored);
	}

	private _monoRepo: MonoRepo | undefined;

	private set monoRepo(value: MonoRepo | undefined) {
		this._monoRepo = value;
	}

	/**
	 * @deprecated Replace usage as soon as possible.
	 */
	public get monoRepo(): MonoRepo | undefined {
		return this._monoRepo;
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
 *
 * @deprecated Should not be used outside the build-tools package.
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
 *
 * @deprecated Should not be used outside the build-tools package.
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
 *
 * @deprecated Should not be used outside the build-tools package.
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

export class MonoRepo implements IWorkspace {
	public constructor(
		public readonly kind: string,
		public readonly repoPath: string,
		private readonly releaseGroupName: ReleaseGroupName,
		private readonly workspace: IWorkspace,
	) {}
	public get directory(): string {
		return this.workspace.directory;
	}

	public get rootPackage(): IPackage {
		return this.workspace.rootPackage;
	}

	public get releaseGroups(): Map<ReleaseGroupName, IReleaseGroup> {
		return this.workspace.releaseGroups;
	}

	public get buildProject(): IBuildProject<IPackage> {
		return this.workspace.buildProject;
	}

	toString(): string {
		return this.workspace.toString();
	}

	checkInstall(): Promise<true | string[]> {
		return this.workspace.checkInstall();
	}

	install(updateLockfile: boolean): Promise<boolean> {
		return this.workspace.install(updateLockfile);
	}

	reload(): void {
		return this.workspace.reload();
	}

	public get name() {
		return this.workspace.name;
	}

	public get packages() {
		return this.workspace.packages;
	}

	private _releaseGroup: IReleaseGroup | undefined;

	public get releaseGroup() {
		if (this._releaseGroup === undefined) {
			this._releaseGroup = this.workspace.releaseGroups.get(this.releaseGroupName);
			if (this._releaseGroup === undefined) {
				throw new Error(
					`Canot find release group "${this.releaseGroupName}" in workspace "${this.workspace.name}"`,
				);
			}
		}
		return this._releaseGroup;
	}

	public get version() {
		return this.releaseGroup.version;
	}
}
