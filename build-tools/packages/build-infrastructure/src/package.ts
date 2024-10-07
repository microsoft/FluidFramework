/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import colors from "ansi-colors";

// Imports are written this way for CJS/ESM compat
import fsePkg from "fs-extra";
const { readJsonSync } = fsePkg;

import { type WorkspaceDefinition, findReleaseGroupForPackage } from "./config.js";
import { readPackageJsonAndIndent, writePackageJson } from "./packageJsonUtils.js";
import type {
	AdditionalPackageProps,
	IPackage,
	IPackageManager,
	PackageDependency,
	PackageJson,
	PackageName,
	ReleaseGroupName,
} from "./types.js";
import { lookUpDirSync } from "./utils.js";

export abstract class PackageBase<
	TAddProps extends AdditionalPackageProps = undefined,
	J extends PackageJson = PackageJson,
> implements IPackage
{
	private static packageCount: number = 0;
	private static readonly chalkColor = [
		colors.red,
		colors.green,
		colors.yellow,
		colors.blue,
		colors.magenta,
		colors.cyan,
		colors.white,
		colors.grey,
		colors.redBright,
		colors.greenBright,
		colors.yellowBright,
		colors.blueBright,
		colors.magentaBright,
		colors.cyanBright,
		colors.whiteBright,
	];

	private readonly _indent: string;
	private _packageJson: J;
	private readonly packageId = Package.packageCount++;

	private get color() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return Package.chalkColor[this.packageId % Package.chalkColor.length]!;
	}

	/**
	 * Create a new package from a package.json file. **Prefer the .load method to calling the contructor directly.**
	 *
	 * @param packageJsonFilePath - The path to a package.json file.
	 * @param packageManager - The package manager used by the workspace.
	 * @param isWorkspaceRoot - Set to true if this package is the root of a workspace.
	 * @param additionalProperties - An object with additional properties that should be added to the class. This is
	 * useful to augment the package class with additional properties.
	 */
	public constructor(
		public readonly packageJsonFilePath: string,
		public readonly packageManager: IPackageManager,
		public readonly isWorkspaceRoot: boolean,
		public readonly releaseGroup: ReleaseGroupName,
		public isReleaseGroupRoot: boolean,
		additionalProperties?: TAddProps,
	) {
		[this._packageJson, this._indent] = readPackageJsonAndIndent(packageJsonFilePath);
		// this.reload();
		if (additionalProperties !== undefined) {
			Object.assign(this, additionalProperties);
		}
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
		return path.dirname(this.packageJsonFilePath);
	}

	public get dependencies(): PackageName[] {
		return Object.keys(this.packageJson.dependencies ?? {}).map((dep) => dep as PackageName);
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

	public get packageJson(): J {
		return this._packageJson;
	}

	public get private(): boolean {
		return this.packageJson.private ?? false;
	}

	public get version(): string {
		return this.packageJson.version;
	}

	public async savePackageJson() {
		writePackageJson(this.packageJsonFilePath, this.packageJson, this._indent);
	}

	public reload() {
		this._packageJson = readJsonSync(this.packageJsonFilePath);
	}

	public toString() {
		return `${this.name} (${this.directory})`;
	}

	public getScript(name: string): string | undefined {
		return this.packageJson.scripts ? this.packageJson.scripts[name] : undefined;
	}

	public async checkInstall(print: boolean = true) {
		if (this.combinedDependencies.next().done) {
			// No dependencies
			return true;
		}

		if (!existsSync(path.join(this.directory, "node_modules"))) {
			if (print) {
				console.error(`${this.nameColored}: node_modules not installed in ${this.directory}`);
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
					console.error(`${this.nameColored}: dependency ${dep.name} not found`);
				}
			}
		}
		return succeeded;
	}
}

export class Package<
	TAddProps extends AdditionalPackageProps = undefined,
	J extends PackageJson = PackageJson,
> extends PackageBase<TAddProps, J> {
	public static loadFromWorkspaceDefinition<
		T extends typeof Package,
		TAddProps extends AdditionalPackageProps = undefined,
	>(
		this: T,
		packageJsonFilePath: string,
		packageManager: IPackageManager,
		isWorkspaceRoot: boolean,
		workspaceDefinition: WorkspaceDefinition,
		additionalProperties?: TAddProps,
	): IPackage {
		const packageName: PackageName = readJsonSync(packageJsonFilePath).name;
		const releaseGroupName = findReleaseGroupForPackage(
			packageName,
			workspaceDefinition.releaseGroups,
		);

		if (releaseGroupName === undefined) {
			throw new Error(`Cannot find release group for package '${packageName}'`);
		}

		const releaseGroupDefinition =
			workspaceDefinition.releaseGroups[releaseGroupName as string];

		if (releaseGroupDefinition === undefined) {
			throw new Error(`Cannot find release group definition for ${releaseGroupName}`);
		}

		const { rootPackageName } = releaseGroupDefinition;
		const isReleaseGroupRoot =
			rootPackageName === undefined ? false : packageName === rootPackageName;
		return new this(
			packageJsonFilePath,
			packageManager,
			isWorkspaceRoot,
			releaseGroupName,
			isReleaseGroupRoot,
			additionalProperties,
		) as InstanceType<T> & TAddProps;
	}

	// /**
	//  * Load a package from a package.json file. Prefer this to calling the contructor directly.
	//  *
	//  * @param packageJsonFilePath - The path to a package.json file.
	//  * @param group - A group that this package is a part of.
	//  * @param monoRepo - Set this if the package is part of a release group (monorepo).
	//  * @param additionalProperties - An object with additional properties that should be added to the class. This is
	//  * useful to augment the package class with additional properties.
	//  */
	// public static load<T extends typeof Package, TAddProps>(
	// 	this: T,
	// 	packageJsonFilePath: string,
	// 	// packageManager: IPackageManager,
	// 	// isWorkspaceRoot: boolean,
	// 	// workspaceDefinition: WorkspaceDefinition,
	// 	additionalProperties?: TAddProps,
	// ) {
	// 	return new this(
	// 		packageJsonFilePath,
	// 		packageManager,
	// 		isWorkspaceRoot,
	// 		releaseGroupName,
	// 		isReleaseGroupRoot,
	// 		additionalProperties,
	// 	) as InstanceType<T> & TAddProps;
	// }
}

export function loadPackageFromWorkspaceDefinition(
	packageJsonFilePath: string,
	packageManager: IPackageManager,
	isWorkspaceRoot: boolean,
	workspaceDefinition: WorkspaceDefinition,
) {
	return Package.loadFromWorkspaceDefinition(
		packageJsonFilePath,
		packageManager,
		isWorkspaceRoot,
		workspaceDefinition,
	);
}
