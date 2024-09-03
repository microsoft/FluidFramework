/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { InterdependencyRange } from "@fluid-tools/version-tools";
import { cosmiconfigSync } from "cosmiconfig";

import {
	type IPackage,
	type PackageName,
	type ReleaseGroupName,
	isIPackage,
} from "./types.js";

/**
 * The version of the fluidRepo configuration currently used.
 *
 * @remarks
 *
 * This is not exported outside of the build-infrastructure package; it is only used internally.
 */
export const FLUIDREPO_CONFIG_VERSION = 1;

/**
 * Top-most configuration for repo layout settings.
 */
export interface IFluidRepoLayout {
	/**
	 * The version of the config.
	 */
	version: typeof FLUIDREPO_CONFIG_VERSION;

	// TODO: Can we infer enough from the old config to use it as is?
	// repoPackages?: {
	// 	[name: string]: IFluidBuildDirs;
	// };

	repoLayout?: {
		workspaces: {
			/**
			 * A mapping of workspace name to folder containing a workspace config file (e.g. pnpm-workspace.yaml)
			 */
			[name: string]: WorkspaceDefinition;
		};
	};
}

export interface WorkspaceDefinition {
	directory: string;
	releaseGroups: {
		[name: string]: ReleaseGroupDefinition;
	};
}

export interface ReleaseGroupDefinition {
	/**
	 * An array of scopes or package names that should be included in the release group. Each package must
	 * belong to a single release group.
	 */
	include: string[];

	/**
	 * An array of scopes or package names that should be excluded. Exclusions are applied AFTER inclusions, so
	 * this can be used to exclude specific packages in a certain scope.
	 */
	exclude?: string[];

	/**
	 * The name of the package that should be considered the root package for the release group. If not provided, the
	 * release group is considered "rootless."
	 *
	 * @remarks
	 *
	 * A release group may have a "root package" that is part of the workspace but fills a similar role to the
	 * workspace-root package: it is a convenient place to store release-group-wide scripts as opposed to workspace-wide
	 * scripts.
	 */
	rootPackageName?: string;

	/**
	 * The interdependencyRange controls the type of semver range to use between packages in the same release
	 * group. This setting controls the default range that will be used when updating the version of a release
	 * group. The default can be overridden using the `--interdependencyRange` flag in the `flub bump` command.
	 */
	defaultInterdependencyRange: InterdependencyRange;

	/**
	 * A URL to the ADO CI pipeline that builds the release group.
	 */
	adoPipelineUrl?: string;
}

export interface IFluidBuildDirs {
	[name: string]: IFluidBuildDirEntry;
}

export type IFluidBuildDirEntry = string | IFluidBuildDir | (string | IFluidBuildDir)[];

/**
 * Configures a package or release group
 */
export interface IFluidBuildDir {
	/**
	 * The path to the package. For release groups this should be the path to the root of the release group.
	 */
	directory: string;

	/**
	 * An array of paths under `directory` that should be ignored.
	 */
	ignoredDirs?: string[];
}

export function matchesReleaseGroupDefinition(
	pkg: IPackage | PackageName,
	{ include, exclude, rootPackageName }: ReleaseGroupDefinition,
): boolean {
	const name = isIPackage(pkg) ? pkg.name : pkg;
	let shouldInclude = false;
	if (
		// If the package name matches an entry in the include list, it should be included
		include.includes(name) ||
		// If the package name starts with any of the include list entries, it should be included
		include.some((scope) => name.startsWith(scope))
	) {
		shouldInclude = true;
	}

	return (
		(shouldInclude && !exclude?.includes(name)) ||
		// If the package name matches the root name, it's definitely part of the release group.
		name === rootPackageName
	);
}

export function findReleaseGroupForPackage(
	pkg: IPackage | PackageName,
	definition: Exclude<WorkspaceDefinition["releaseGroups"], undefined>,
): ReleaseGroupName | undefined {
	for (const [rgName, def] of Object.entries(definition)) {
		if (matchesReleaseGroupDefinition(pkg, def)) {
			return rgName as ReleaseGroupName;
		}
	}
}

const configName = "repoLayout";

/**
 * A cosmiconfig explorer to find the repoLayout config. First looks for JavaScript config files and falls back to the
 * `fluidBuild` property in package.json. We create a single explorer here because cosmiconfig internally caches configs
 * for performance. The cache is per-explorer, so re-using the same explorer is a minor perf improvement.
 */
const configExplorer = cosmiconfigSync(configName, {
	searchPlaces: [
		`${configName}.config.cjs`,
		`${configName}.config.js`,

		// Load from the fluidBuild config files as a fallback.
		"fluidBuild.config.cjs",
		"fluidBuild.config.js",

		// Or the repoLayout property in package.json
		"package.json",
	],
	packageProp: [configName],
});

/**
 * Get an IFluidRepoLayout from the config file.
 *
 * @param rootDir - The path to the root package.json to load.
 * @param noCache - If true, the config cache will be cleared and the config will be reloaded.
 * @returns The fluidBuild section of the package.json, or undefined if not found
 */
export function getFluidRepoLayout(
	rootDir: string,
	noCache = false,
	// log = defaultLogger,
): IFluidRepoLayout {
	if (noCache === true) {
		configExplorer.clearCaches();
	}

	const configResult = configExplorer.search(rootDir);
	const config = configResult?.config as IFluidRepoLayout | undefined;

	if (config === undefined) {
		throw new Error("No fluidRepo configuration found.");
	}

	// Only version 1 of the config is supported. If any other value is provided, throw an error.
	if (config.version !== FLUIDREPO_CONFIG_VERSION) {
		throw new Error(
			`Configuration version is not supported: ${config?.version}. Config version must be ${FLUIDREPO_CONFIG_VERSION}.`,
		);
	}
	return config;
}
