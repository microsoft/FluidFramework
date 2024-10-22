/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import path from "node:path";

// Imports are written this way for CJS/ESM compat
import fsePkg from "fs-extra";
const { readJsonSync } = fsePkg;
import colors from "picocolors";

import { type WorkspaceDefinition, findReleaseGroupForPackage } from "./config.js";
import { readPackageJsonAndIndent, writePackageJson } from "./packageJsonUtils.js";
import type {
	AdditionalPackageProps,
	IPackage,
	IPackageManager,
	IWorkspace,
	PackageDependency,
	PackageJson,
	PackageName,
	ReleaseGroupName,
} from "./types.js";
import { lookUpDirSync } from "./utils.js";

/**
 * {@inheritDoc IPackage}
 */
export abstract class PackageBase<
	J extends PackageJson = PackageJson,
	TAddProps extends AdditionalPackageProps = undefined,
> implements IPackage<J>
{
	// eslint-disable-next-line @typescript-eslint/prefer-readonly -- false positive; this value is changed
	private static packageCount: number = 0;
	private static readonly colorFunction = [
		colors.red,
		colors.green,
		colors.yellow,
		colors.blue,
		colors.magenta,
		colors.cyan,
		colors.white,
		colors.gray,
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

	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	private get color() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return Package.colorFunction[this.packageId % Package.colorFunction.length]!;
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
		/**
		 * {@inheritDoc IPackage.packageJsonFilePath}
		 */
		public readonly packageJsonFilePath: string,

		/**
		 * {@inheritDoc IPackage.packageManager}
		 */
		public readonly packageManager: IPackageManager,

		/**
		 * {@inheritDoc IPackage.workspace}
		 */
		public readonly workspace: IWorkspace,

		/**
		 * {@inheritDoc IPackage.isWorkspaceRoot}
		 */
		public readonly isWorkspaceRoot: boolean,

		/**
		 * {@inheritDoc IPackage.releaseGroup}
		 */
		public readonly releaseGroup: ReleaseGroupName,

		/**
		 * {@inheritDoc IPackage.isReleaseGroupRoot}
		 */
		public isReleaseGroupRoot: boolean,
		additionalProperties?: TAddProps,
	) {
		[this._packageJson, this._indent] = readPackageJsonAndIndent(packageJsonFilePath);
		// this.reload();
		if (additionalProperties !== undefined) {
			Object.assign(this, additionalProperties);
		}
	}

	/**
	 * {@inheritDoc IPackage.combinedDependencies}
	 */
	public get combinedDependencies(): Generator<PackageDependency, void> {
		return iterateDependencies(this.packageJson);
	}

	/**
	 * {@inheritDoc IPackage.directory}
	 */
	public get directory(): string {
		return path.dirname(this.packageJsonFilePath);
	}

	/**
	 * {@inheritDoc IPackage.name}
	 */
	public get name(): PackageName {
		return this.packageJson.name as PackageName;
	}

	/**
	 * {@inheritDoc IPackage.nameColored}
	 */
	public get nameColored(): string {
		return this.color(this.name);
	}

	/**
	 * {@inheritDoc IPackage.packageJson}
	 */
	public get packageJson(): J {
		return this._packageJson;
	}

	/**
	 * {@inheritDoc IPackage.private}
	 */
	public get private(): boolean {
		return this.packageJson.private ?? false;
	}

	/**
	 * {@inheritDoc IPackage.version}
	 */
	public get version(): string {
		return this.packageJson.version;
	}

	/**
	 * {@inheritDoc IPackage.savePackageJson}
	 */
	public async savePackageJson(): Promise<void> {
		writePackageJson(this.packageJsonFilePath, this.packageJson, this._indent);
	}

	/**
	 * Reload the package from the on-disk package.json.
	 */
	public reload(): void {
		this._packageJson = readJsonSync(this.packageJsonFilePath) as J;
	}

	public toString(): string {
		return `${this.name} (${this.directory})`;
	}

	/**
	 * {@inheritDoc IPackage.getScript}
	 */
	public getScript(name: string): string | undefined {
		return this.packageJson.scripts === undefined ? undefined : this.packageJson.scripts[name];
	}

	/**
	 * {@inheritDoc Installable.checkInstall}
	 */
	public async checkInstall(print: boolean = true): Promise<boolean> {
		if (this.combinedDependencies.next().done === true) {
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
			const found = lookUpDirSync(this.directory, (currentDir) => {
				// TODO: check semver as well
				return existsSync(path.join(currentDir, "node_modules", dep.name));
			});

			if (found === undefined) {
				succeeded = false;
				if (print) {
					console.error(`${this.nameColored}: dependency ${dep.name} not found`);
				}
			}
		}
		return succeeded;
	}

	/**
	 * Installs the dependencies for all packages in this package's workspace.
	 */
	public async install(updateLockfile: boolean): Promise<boolean> {
		return this.workspace.install(updateLockfile);
	}
}

export class Package<
	TAddProps extends AdditionalPackageProps = undefined,
	J extends PackageJson = PackageJson,
> extends PackageBase<J, TAddProps> {
	public static loadFromWorkspaceDefinition<
		T extends typeof Package,
		J extends PackageJson = PackageJson,
		TAddProps extends AdditionalPackageProps = undefined,
	>(
		this: T,
		packageJsonFilePath: string,
		packageManager: IPackageManager,
		isWorkspaceRoot: boolean,
		workspaceDefinition: WorkspaceDefinition,
		workspace: IWorkspace,
		additionalProperties?: TAddProps,
	): IPackage {
		const packageName: PackageName = (readJsonSync(packageJsonFilePath) as J)
			.name as PackageName;
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

		const pkg = new this(
			packageJsonFilePath,
			packageManager,
			workspace,
			isWorkspaceRoot,
			releaseGroupName,
			isReleaseGroupRoot,
			additionalProperties,
		);

		return pkg;
	}
}

export function loadPackageFromWorkspaceDefinition(
	packageJsonFilePath: string,
	packageManager: IPackageManager,
	isWorkspaceRoot: boolean,
	workspaceDefinition: WorkspaceDefinition,
	workspace: IWorkspace,
): IPackage {
	return Package.loadFromWorkspaceDefinition(
		packageJsonFilePath,
		packageManager,
		isWorkspaceRoot,
		workspaceDefinition,
		workspace,
	);
}

function* iterateDependencies<T extends PackageJson>(
	packageJson: T,
): Generator<PackageDependency, void> {
	for (const [pkgName, version] of Object.entries(packageJson.dependencies ?? {})) {
		const name = pkgName as PackageName;
		if (version === undefined) {
			throw new Error(`Dependency found without a version specifier: ${name}`);
		}
		yield {
			name,
			version,
			depKind: "prod",
		} as const;
	}

	for (const [pkgName, version] of Object.entries(packageJson.devDependencies ?? {})) {
		const name = pkgName as PackageName;
		if (version === undefined) {
			throw new Error(`Dependency found without a version specifier: ${name}`);
		}
		yield {
			name,
			version,
			depKind: "dev",
		} as const;
	}

	for (const [pkgName, version] of Object.entries(packageJson.devDependencies ?? {})) {
		const name = pkgName as PackageName;
		if (version === undefined) {
			throw new Error(`Dependency found without a version specifier: ${name}`);
		}
		yield {
			name,
			version,
			depKind: "peer",
		} as const;
	}
}
