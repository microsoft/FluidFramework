/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InterdependencyRange } from "@fluid-tools/version-tools";
import { TaskDefinitionsOnDisk } from "./fluidTaskDefinitions";

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
export interface DeclarativeTask {
	/**
	 * An array of globs that will be used to identify input files for the task. The globs are interpreted relative to the
	 * package the task belongs to.
	 *
	 * By default, inputGlobs **will not** match files ignored by git. This can be changed using the `gitignore` property
	 * on the task. See the documentation for that property for details.
	 */
	inputGlobs: string[];

	/**
	 * An array of globs that will be used to identify output files for the task. The globs are interpreted relative to
	 * the package the task belongs to.
	 *
	 * By default, outputGlobs **will** match files ignored by git, because build output is often gitignored. This can be
	 *   changed using the `gitignore` property on the task. See the documentation for that property for details.
	 */
	outputGlobs: string[];

	/**
	 * Configures how gitignore rules are applied. "input" applies gitignore rules to the input, "output" applies them to
	 * the output, and including both values will apply the gitignore rules to both the input and output globs.
	 *
	 * The default value, `["input"]` applies gitignore rules to the input, but not the output. This is the right behavior
	 * for many tasks since most tasks use source-controlled files as input but generate gitignored build output. However,
	 * it can be adjusted on a per-task basis depending on the needs of the task.
	 *
	 * @defaultValue `["input"]`
	 */
	gitignore?: GitIgnoreSetting;
}

export type GitIgnoreSetting = ("input" | "output")[];

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
