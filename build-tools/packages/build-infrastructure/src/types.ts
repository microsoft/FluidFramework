/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleGit } from "simple-git";
import type { Opaque, SetRequired, PackageJson as StandardPackageJson } from "type-fest";

/**
 * A type representing fluid-build-specific config that may be in package.json.
 */
export type FluidPackageJsonFields = {
	/**
	 * pnpm config
	 */
	pnpm?: {
		overrides?: Record<string, string>;
	};
};

export type PackageJson = SetRequired<
	StandardPackageJson & FluidPackageJsonFields,
	"name" | "scripts" | "version"
>;

export type AdditionalPackageProps = Record<string, string> | undefined;

/**
 * A Fluid repo organizes a collection of npm packages into workspaces and release groups. A Fluid repo can contain
 * multiple workspaces, and a workspace can in turn contain multiple release groups. Both workspaces and release groups
 * represent ways to organize packages in the repo, but their purpose and function are different.
 */
export interface IFluidRepo extends Reloadable {
	/**
	 * The absolute path to the root of the IFluidRepo. This is the path where the config file is located.
	 */
	root: string;

	workspaces: Map<WorkspaceName, IWorkspace>;

	releaseGroups: Map<ReleaseGroupName, IReleaseGroup>;

	packages: Map<PackageName, IPackage>;

	/**
	 * Transforms an absolute path to a path relative to the FluidRepo root.
	 *
	 * @param p - The path to make relative to the FluidRepo root.
	 * @returns the relative path.
	 */
	relativeToRepo(p: string): string;

	/**
	 * If the FluidRepo is within a Git repository, this function will return a SimpleGit instance rooted at the root of
	 * the Git repository. If the FluidRepo is _not_ within a Git repository, this function will throw a
	 * {@link NotInGitRepository} error.
	 *
	 * @throws A {@link NotInGitRepository} error if the path is not within a Git repository.
	 */
	getGitRepository(): Promise<Readonly<SimpleGit>>;

	/**
	 * Returns the {@link IReleaseGroup} associated with a package.
	 */
	getPackageReleaseGroup(pkg: Readonly<IPackage>): Readonly<IReleaseGroup>;

	/**
	 * Returns the {@link IWorkspace} associated with a package.
	 */
	getPackageWorkspace(pkg: Readonly<IPackage>): Readonly<IWorkspace>;
}

/**
 * A common interface for installable things, like packages, release groups, and workspaces.
 */
export interface Installable {
	/**
	 * Returns `true` if the item is installed. If this returns `false`, then the `install` function can be called to
	 * install.
	 */
	checkInstall(): Promise<boolean>;

	/**
	 * Installs the item.
	 *
	 * @param updateLockfile - If true, the lockfile will be updated. Otherwise, the lockfile will not be updated. This
	 * may cause the installation to fail.
	 */
	install(updateLockfile: boolean): Promise<boolean>;
}

export interface Reloadable {
	reload(): void;
}

export type WorkspaceName = Opaque<string, "WorkspaceName">;

export interface IWorkspace extends Installable, Reloadable {
	name: WorkspaceName;
	directory: string;
	rootPackage: IPackage;
	releaseGroups: Map<ReleaseGroupName, IReleaseGroup>;
	packages: IPackage[];
	toString(): string;
}

export type ReleaseGroupName = Opaque<string, IReleaseGroup>;

export interface IReleaseGroup extends Reloadable {
	readonly name: ReleaseGroupName;
	readonly version: string;
	readonly rootPackage?: IPackage;
	readonly packages: IPackage[];
	readonly workspace: IWorkspace;
	readonly adoPipelineUrl?: string;
	toString(): string;
}

export function isIReleaseGroup(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	toCheck: Exclude<any, string | number | ReleaseGroupName | PackageName>,
): toCheck is IReleaseGroup {
	if (!("name" in toCheck)) {
		return false;
	}

	if (typeof toCheck === "object") {
		// TODO: is there a better way to implement a type guard than unique names of properties? Maybe something with the
		// opaque types?
		return "workspace" in toCheck && "packages" in toCheck;
	}

	return false;
}

export type PackageManagerName = "npm" | "pnpm" | "yarn";

export interface IPackageManager {
	readonly name: PackageManagerName;
	installCommand(updateLockfile: boolean): string;
}

/**
 * Information about a package dependency.
 */
export interface PackageDependency {
	name: PackageName;
	version: string;
	depClass: "prod" | "dev" | "peer";
}

export type PackageName = Opaque<string, "PackageName">;

export interface IPackage<J extends PackageJson = PackageJson>
	extends Pick<Installable, "checkInstall">,
		Reloadable {
	readonly name: PackageName;
	readonly nameColored: string;
	readonly directory: string;
	packageJson: J;
	readonly packageManager: IPackageManager;
	readonly version: string;
	readonly private: boolean;
	readonly isWorkspaceRoot: boolean;
	releaseGroup: ReleaseGroupName;
	isReleaseGroupRoot: boolean;
	readonly packageJsonFilePath: string;
	readonly dependencies: PackageName[];
	getScript(name: string): string | undefined;
	savePackageJson(): Promise<void>;
	combinedDependencies: Generator<PackageDependency, void>;
	toString(): string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- this is a type guard
export function isIPackage(pkg: any): pkg is IPackage {
	if (typeof pkg === "object") {
		return "getScript" in pkg;
	}
	return false;
}
