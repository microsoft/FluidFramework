/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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

export interface IFluidRepo {
	/**
	 * Absolute path to the root of the repo.
	 */
	root: string;

	workspaces: Map<WorkspaceName, IWorkspace>;

	releaseGroups: Map<ReleaseGroupName, IReleaseGroup>;

	packages: Map<PackageName, IPackage>;
}

export interface Installable {
	checkInstall(): Promise<boolean>;
	install(updateLockfile: boolean): Promise<boolean>;
}

export type WorkspaceName = Opaque<string, "WorkspaceName">;

export interface IWorkspace extends Installable {
	name: WorkspaceName;
	directory: string;
	rootPackage: IPackage;
	releaseGroups: Map<ReleaseGroupName, IReleaseGroup>;
	packages: IPackage[];
}

export type ReleaseGroupName = Opaque<string, IReleaseGroup>;

export interface IReleaseGroup {
	readonly name: ReleaseGroupName;
	readonly version: string;
	readonly rootPackage?: IPackage;
	readonly packages: IPackage[];
	readonly workspace: IWorkspace;
	readonly adoPipelineUrl?: string;
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
	extends Pick<Installable, "checkInstall"> {
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
	reload(): void;
	combinedDependencies: Generator<PackageDependency, void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- this is a type guard
export function isIPackage(pkg: any): pkg is IPackage {
	if (typeof pkg === "object") {
		return "getScript" in pkg;
	}
	return false;
}
