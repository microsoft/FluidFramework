/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InterdependencyRange } from "@fluid-tools/version-tools";
import type {
	GitIgnoreSetting,
	TaskDefinitionsOnDisk,
	TaskFileDependencies,
} from "./fluidTaskDefinitions";

/**
 * Token that can be used in file paths and globs to represent the repository root directory.
 * This allows configs to reference root-level files without hardcoding relative paths like "../../".
 *
 * Example: "${repoRoot}/.eslintrc.cjs" will resolve to the .eslintrc.cjs file at the repository root.
 */
export const REPO_ROOT_TOKEN = "${repoRoot}";

const REPO_ROOT_REGEX = /\$\{repoRoot\}/g;

/**
 * Replace the {@link REPO_ROOT_TOKEN} in a path or glob with the actual repository root path.
 *
 * @remarks
 * The repo root is normalized to forward slashes and trailing separators are removed, so the
 * result is safe for globbing libraries (fast-glob treats backslashes as escape characters).
 */
export function replaceRepoRootToken(pathOrGlob: string, repoRoot: string): string {
	const normalized = repoRoot.replace(/\\/g, "/").replace(/\/+$/, "");
	return pathOrGlob.replace(REPO_ROOT_REGEX, normalized);
}

/**
 * Replace the {@link REPO_ROOT_TOKEN} in an array of paths or globs.
 */
export function replaceRepoRootTokens(
	pathsOrGlobs: readonly string[],
	repoRoot: string,
): string[] {
	return pathsOrGlobs.map((p) => replaceRepoRootToken(p, repoRoot));
}

/**
 * The version of the fluidBuild configuration currently used.
 *
 * @remarks
 *
 * This is not exported outside of the build-tools package; it is only used internally.
 */
export const FLUIDBUILD_CONFIG_VERSION = 1;

/**
 * The default fluid-build config if one is not found.
 */
export const DEFAULT_FLUIDBUILD_CONFIG: IFluidBuildConfig = {
	version: FLUIDBUILD_CONFIG_VERSION,
	repoPackages: {
		root: "",
	},
};

/**
 * Top-most configuration for repo build settings.
 */
export interface IFluidBuildConfig {
	/**
	 * The version of the config.
	 *
	 * IMPORTANT: this will become required in a future release.
	 */
	version?: typeof FLUIDBUILD_CONFIG_VERSION;

	/**
	 * Build tasks and dependencies definitions
	 */
	tasks?: TaskDefinitionsOnDisk;

	/**
	 * Add task handlers based on configuration only. This allows you to add incremental build support for executables and
	 * commands that don't support it.
	 */
	declarativeTasks?: DeclarativeTasks;

	/**
	 * An array of commands that are known to have subcommands and should be parsed as such.
	 *
	 * These values will be combined with the default values: ["flub", "biome"]
	 */
	multiCommandExecutables?: string[];

	/**
	 * A mapping of package or release group names to metadata about the package or release group. This can only be
	 * configured in the repo-wide Fluid build config (the repo-root package.json).
	 */
	repoPackages?: IFluidBuildDirs;
}

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

	/**
	 * For backwards compatibility, the defaultInterdependencyRange for a release group can be configured here in the
	 * fluid-build config. This property should no longer be used and will be removed in a future release.
	 *
	 * @deprecated This property is now configured in the bump.defaultInterdependencyRange setting in the flub config.
	 * This property will be removed in a future release.
	 */
	defaultInterdependencyRange?: InterdependencyRange;
}

export type IFluidBuildDirEntry = string | IFluidBuildDir | (string | IFluidBuildDir)[];

export interface IFluidBuildDirs {
	[name: string]: IFluidBuildDirEntry;
}

/**
 * Declarative tasks allow fluid-build to support incremental builds for tasks it doesn't natively identify. A
 * DeclarativeTask defines a set of input and output globs, and files matching those globs will be included in the
 * donefiles (the cached data we check to see if tasks need to be run) for the task.
 *
 * Note that by default, gitignored files are treated differently for input globs vs. output globs. This can be
 * changed using the `gitignore` property on the task. See the documentation for that property for details.
 */
export interface DeclarativeTask extends TaskFileDependencies {}

/**
 * Valid values that can be used in the `gitignore` array setting of a DeclarativeTask.
 */
export type GitIgnoreSettingValue = GitIgnoreSetting[number];

/**
 * The default gitignore setting for a DeclarativeTask.
 */
export const gitignoreDefaultValue: GitIgnoreSetting = ["input"];

/**
 * This mapping of executable/command name to DeclarativeTask is used to connect the task to the correct executable(s).
 * Note that multi-command executables must also be included in the multiCommandExecutables setting. If they are not,
 * the commands will not be parsed correctly and may not match the task as expected.
 */
export interface DeclarativeTasks {
	[executable: string]: DeclarativeTask;
}
