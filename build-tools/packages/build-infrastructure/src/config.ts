/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { cosmiconfigSync } from "cosmiconfig";

import {
	type IPackage,
	type PackageName,
	type ReleaseGroupName,
	isIPackage,
} from "./types.js";

/**
 * The version of the BuildProject configuration currently used.
 */
export const BUILDPROJECT_CONFIG_VERSION = 1;

/**
 * Top-most configuration for BuildProject settings.
 */
export interface BuildProjectConfig {
	/**
	 * The version of the config.
	 */
	version: typeof BUILDPROJECT_CONFIG_VERSION;

	/**
	 * **BACK-COMPAT ONLY**
	 *
	 * A mapping of package or release group names to metadata about the package or release group.
	 *
	 * @deprecated Use the buildProject property instead.
	 */
	repoPackages?: IFluidBuildDirs;

	/**
	 * The layout of the build project into workspaces and release groups.
	 */
	buildProject?: {
		workspaces: {
			/**
			 * A mapping of workspace name to folder containing a workspace config file (e.g. pnpm-workspace.yaml).
			 */
			[name: string]: WorkspaceDefinition;
		};
	};
}

/**
 * The definition of a workspace ih configuration.
 */
export interface WorkspaceDefinition {
	/**
	 * The root directory of the workspace. This folder should contain a workspace config file (e.g. pnpm-workspace.yaml).
	 */
	directory: string;

	/**
	 * Definitions of the release groups within the workspace.
	 */
	releaseGroups: {
		/**
		 * A mapping of release group name to a definition for the release group.
		 */
		[name: string]: ReleaseGroupDefinition;
	};
}

/**
 * The definition of a release group ih configuration.
 */
export interface ReleaseGroupDefinition {
	/**
	 * An array of scopes or package names that should be included in the release group. Each package must
	 * belong to a single release group.
	 *
	 * To include all packages, set this value to a single element: `["*"]`.
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
	 * A URL to the ADO CI pipeline that builds the release group.
	 */
	adoPipelineUrl?: string;
}

/**
 * @deprecated Use buildProject and associated types instead.
 */
export interface IFluidBuildDirs {
	[name: string]: IFluidBuildDirEntry;
}

/**
 * @deprecated Use buildProject and associated types instead.
 */
export type IFluidBuildDirEntry = string | IFluidBuildDir | (string | IFluidBuildDir)[];

/**
 * Configures a package or release group
 *
 * @deprecated Use buildProject and associated types instead.
 */
export interface IFluidBuildDir {
	/**
	 * The path to the package. For release groups this should be the path to the root of the release group.
	 */
	directory: string;

	/**
	 * An array of paths under `directory` that should be ignored.
	 *
	 * @deprecated This field is unused in all known configs and is ignored by the back-compat loading code.
	 */
	ignoredDirs?: string[];
}

/**
 * Checks if a package matches a given {@link ReleaseGroupDefinition}.
 *
 * @returns `true` if the package matches the release group definition; `false` otherwise.
 */
export function matchesReleaseGroupDefinition(
	pkg: IPackage | PackageName,
	{ include, exclude, rootPackageName }: ReleaseGroupDefinition,
): boolean {
	const name = isIPackage(pkg) ? pkg.name : pkg;
	let shouldInclude = false;

	if (
		// Special case: an include value with a single element, "*", should include all packages.
		(include.length === 1 && include[0] === "*") ||
		// If the package name matches an entry in the include list, it should be included
		include.includes(name) ||
		// If the package name starts with any of the include list entries, it should be included
		include.some((scope) => name.startsWith(scope))
	) {
		shouldInclude = true;
	}

	const shouldExclude = exclude?.includes(name) ?? false;
	return (
		(shouldInclude && !shouldExclude) ||
		// If the package name matches the root name, it's definitely part of the release group.
		name === rootPackageName
	);
}

/**
 * Finds the name of the release group that a package belongs to based on the release group configuration within a
 * workspace.
 *
 * @param pkg - The package for which to find a release group.
 * @param definition - The "releaseGroups" config from the RepoLayout configuration.
 * @returns The name of the package's release group.
 */
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

const configName = "buildProject";

/**
 * A cosmiconfig explorer to find the buildProject config. First looks for JavaScript config files and falls back to the
 * `buildProject` property in package.json. We create a single explorer here because cosmiconfig internally caches
 * configs for performance. The cache is per-explorer, so re-using the same explorer is a minor perf improvement.
 */
const configExplorer = cosmiconfigSync(configName, {
	searchPlaces: [
		`${configName}.config.cjs`,
		`${configName}.config.js`,

		// Load from the fluidBuild config files as a fallback.
		"fluidBuild.config.cjs",
		"fluidBuild.config.js",

		// Or the buildProject property in package.json
		"package.json",
	],
	packageProp: [configName],
});

/**
 * Search a path for a build project config file, and return the parsed config and the path to the config file.
 *
 * @param searchPath - The path to start searching for config files in.
 * @param noCache - If true, the config cache will be cleared and the config will be reloaded.
 * @returns The loaded build project config and the path to the config file.
 *
 * @throws If a config is not found or if the config version is not supported.
 */
export function getBuildProjectConfig(
	searchPath: string,
	noCache = false,
): { config: BuildProjectConfig; configFilePath: string } {
	if (noCache === true) {
		configExplorer.clearCaches();
	}

	const configResult = configExplorer.search(searchPath);
	if (configResult === null || configResult === undefined) {
		throw new Error("No BuildProject configuration found.");
	}
	const config = configResult.config as BuildProjectConfig;

	// Only version 1 of the config is supported. If any other value is provided, throw an error.
	if (config.version !== BUILDPROJECT_CONFIG_VERSION) {
		throw new Error(
			`Configuration version is not supported: ${config?.version}. Config version must be ${BUILDPROJECT_CONFIG_VERSION}.`,
		);
	}

	return { config, configFilePath: configResult.filepath };
}
