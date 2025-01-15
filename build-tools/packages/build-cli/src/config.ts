/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { statSync } from "node:fs";
import { MonoRepo } from "@fluidframework/build-tools";
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { cosmiconfigSync } from "cosmiconfig";
import type { SemVer } from "semver";
import { Context } from "./library/index.js";
import type { ReleaseGroup } from "./releaseGroups.js";

/**
 * Requirements for a given script.
 */
export type ScriptRequirement = Static<typeof ScriptRequirement>;
export const ScriptRequirement = Type.Object({
	/**
	 * Name of the script to check.
	 */
	name: Type.String(),

	/**
	 * Body of the script being checked.
	 * A contents match will be enforced iff {@link ScriptRequirement.bodyMustMatch}.
	 * This value will be used as the default contents inserted by the policy resolver (regardless of {@link ScriptRequirement.bodyMustMatch}).
	 */
	body: Type.String(),

	/**
	 * Whether or not the script body is required to match {@link ScriptRequirement.body} when running the policy checker.
	 * @defaultValue `false`
	 */
	bodyMustMatch: Type.Optional(Type.Boolean()),
});

// TODO: This is a duplicated definition of the type in version-tools. This code should live there and replace the
// version-tools definition.
/**
 * A type for valid dependency ranges in package.json.
 */
type InterdependencyRangeSetting = Static<typeof InterdependencyRangeSetting>;
const InterdependencyRangeSetting = Type.Union([
	Type.Literal(""),
	Type.Literal("workspace:*"),
	Type.Literal("workspace:^"),
	Type.Literal("workspace:~"),
	Type.TemplateLiteral([Type.Literal("^"), Type.Optional(Type.String())]),
	Type.TemplateLiteral([Type.Literal("~"), Type.Optional(Type.String())]),
	// TODO: The original type allowed semver.SemVer objects as well - not sure how to express that in typebox.
]);

/**
 * Configuration settings that influence `flub bump`.
 */
export type BumpConfig = Static<typeof BumpConfig>;
export const BumpConfig = Type.Object({
	/**
	 * The interdependencyRange controls the type of semver range to use between packages in the same release group. This
	 * setting controls the default range that will be used when updating the version of a release group. The default can
	 * be overridden using the `--interdependencyRange` flag in the `flub bump` command.
	 */
	defaultInterdependencyRange: Type.Optional(
		Type.Record(Type.String(), InterdependencyRangeSetting),
	),
});

/**
 * Expresses requirements for a given package, applied to its package.json.
 */
export type PackageRequirements = Static<typeof PackageRequirements>;
export const PackageRequirements = Type.Object({
	/**
	 * (optional) list of script requirements for the package.
	 */
	requiredScripts: Type.Optional(Type.Array(ScriptRequirement)),

	/**
	 * (optional) list of required dev dependencies for the package.
	 * @remarks Note: there is no enforcement of version requirements, only that a dependency on the specified name must exist.
	 */
	requiredDevDependencies: Type.Optional(Type.Array(Type.String())),
});

/**
 * Configuration for package naming and publication policies.
 */
export type PackageNamePolicyConfig = Static<typeof PackageNamePolicyConfig>;
export const PackageNamePolicyConfig = Type.Object({
	/**
	 * A list of package scopes that are permitted in the repo.
	 */
	allowedScopes: Type.Optional(Type.Array(Type.String())),

	/**
	 * A list of packages that have no scope.
	 */
	unscopedPackages: Type.Optional(Type.Array(Type.String())),

	/**
	 * Packages that must be published.
	 */
	mustPublish: Type.Object({
		/**
		 * A list of package names or scopes that must publish to npm, and thus should never be marked private.
		 */
		npm: Type.Optional(Type.Array(Type.String())),

		/**
		 * A list of package names or scopes that must publish to an internal feed, and thus should always be marked
		 * private.
		 */
		internalFeed: Type.Optional(Type.Array(Type.String())),
	}),

	/**
	 * Packages that may or may not be published.
	 */
	mayPublish: Type.Object({
		/**
		 * A list of package names or scopes that may publish to npm, and thus might or might not be marked private.
		 */
		npm: Type.Optional(Type.Array(Type.String())),

		/**
		 * A list of package names or scopes that must publish to an internal feed, and thus might or might not be marked
		 * private.
		 */
		internalFeed: Type.Optional(Type.Array(Type.String())),
	}),
});

/**
 * Configuration for package naming and publication policies.
 */
export type AssertTaggingConfig = Static<typeof AssertTaggingConfig>;
export const AssertTaggingConfig = Type.Object({
	assertionFunctions: Type.Record(Type.String(), Type.Number()),

	/**
	 * An array of paths under which assert tagging applies to. If this setting is provided, only packages whose paths
	 * match the regular expressions in this setting will be assert-tagged.
	 *
	 * TODO: Original typing was `RegExp[]` -- can we tighten this definition?
	 */
	enabledPaths: Type.Optional(Type.Array(Type.String())),
});

/**
 * Policy configuration for the `check:policy` command.
 */
export type PolicyConfig = Static<typeof PolicyConfig>;
export const PolicyConfig = Type.Object({
	additionalLockfilePaths: Type.Optional(Type.Array(Type.String())),
	pnpmSinglePackageWorkspace: Type.Optional(Type.Array(Type.String())),
	fluidBuildTasks: Type.Object({
		tsc: Type.Object({
			ignoreTasks: Type.Array(Type.String()),
			ignoreDependencies: Type.Array(Type.String()),
			ignoreDevDependencies: Type.Array(Type.String()),
		}),
	}),
	dependencies: Type.Optional(
		Type.Object({
			commandPackages: Type.Array(Type.Tuple([Type.String(), Type.String()])),
		}),
	),

	/**
	 * An array of strings/regular expressions. Paths that match any of these expressions will be completely excluded from
	 * policy-check.
	 */
	exclusions: Type.Optional(Type.Array(Type.String())),

	/**
	 * An object with handler name as keys that maps to an array of strings/regular expressions to
	 * exclude that rule from being checked.
	 */
	handlerExclusions: Type.Record(Type.String(), Type.Array(Type.String())),

	packageNames: Type.Optional(PackageNamePolicyConfig),

	/**
	 * (optional) requirements to enforce against each public package.
	 */
	publicPackageRequirements: Type.Optional(PackageRequirements),
});

/**
 * A short name for the section. Each section in a {@link ReleaseNotesConfig} must have a unique name.
 */
export type ReleaseNotesSectionName = string;

/**
 * Configuration for a release notes section.
 */
export type ReleaseNotesSection = Static<typeof ReleaseNotesSection>;
export const ReleaseNotesSection = Type.Object({
	/**
	 * A full string to serve as the heading for the section when displayed in release notes.
	 */
	heading: Type.String(),
});

/**
 * Configuration for the `generate:releaseNotes` command. If this configuration is not present in the config, the
 * `generate:releaseNotes` command will report an error.
 */
export type ReleaseNotesConfig = Static<typeof ReleaseNotesConfig>;
export const ReleaseNotesConfig = Type.Object({
	sections: Type.Record(Type.String(), ReleaseNotesSection),
});

/**
 * Configuration for the `release report` command. If this configuration is not present in the config, the
 * `release report` command will report an error.
 */
export type ReleaseReportConfig = Static<typeof ReleaseReportConfig>;
export const ReleaseReportConfig = Type.Object({
	/**
	 * Each key in the `legacyCompatInterval` object represents a specific release group or package name as string,
	 * and the associated value is a number that defines the legacy compatibility interval for that group.
	 */
	legacyCompatInterval: Type.Record(Type.String(), Type.Number()),
});

/**
 * Flub configuration that is expected in the flub config file or package.json.
 */
export type FlubConfig = Static<typeof FlubConfig>;
export const FlubConfig = Type.Object({
	/**
	 * The version of the config.
	 *
	 * IMPORTANT: this will become required in a future release.
	 *
	 * @remarks
	 *
	 * For backwards-compatibility with the fluidBuild config file - that is, supporting both the flub config and the
	 * fluidBuild config in the same config file - this value must match the version value of the
	 * fluidBuildConfig. Once they diverge, the flub config must be separate from the fluidBuild config.
	 *
	 * In other words, version 1 is the only version of the configs where they can be stored in the same file.
	 */
	version: Type.Optional(Type.Number({ maximum: 1, minimum: 1 })),

	/**
	 * Ponfiguration for the `check:policy` command.
	 */
	policy: Type.Optional(PolicyConfig),

	/**
	 * Configuration for assert tagging.
	 */
	assertTagging: Type.Optional(AssertTaggingConfig),

	/**
	 * Configuration for `flub bump`.
	 */
	bump: Type.Optional(BumpConfig),

	/**
	 * Configuration for the `generate:releaseNotes` command.
	 */
	releaseNotes: Type.Optional(ReleaseNotesConfig),

	/**
	 * Configuration for `release report` command
	 */
	releaseReport: Type.Optional(ReleaseReportConfig),
});

// export interface FlubConfig {
// 	/**
// 	 * A mapping of branch names to previous version baseline styles. The type test generator takes this information
// 	 * into account when calculating the baseline version to use when it's run on a particular branch. If this is not
// 	 * defined for a branch or package, then that package will be skipped during type test generation.
// 	 *
// 	 * @deprecated This setting is no longer used and will be removed in the future.
// 	 */
// 	branchReleaseTypes?: {
// 		[name: string]: VersionBumpType | PreviousVersionStyle;
// 	};
// }

/**
 * A type representing the different version constraint styles we use when determining the previous version for type
 * test generation.
 *
 * The "base" versions are calculated by zeroing out all version segments lower than the base. That is, for a version v,
 * the baseMajor version is `${v.major}.0.0` and the baseMinor version is `${v.major}.${v.minor}.0`.
 *
 * The "previous" versions work similarly, but the major/minor/patch segment is reduced by 1. That is, for a version v,
 * the previousMajor version is `${min(v.major - 1, 1)}.0.0`, the previousMinor version is
 * `${v.major}.${min(v.minor - 1, 0)}.0`, and the previousPatch is `${v.major}.${v.minor}.${min(v.patch - 1, 0)}.0`.
 *
 * The "previous" versions never roll back below 1 for the major version and 0 for minor and patch. That is, the
 * previousMajor, previousMinor, and previousPatch versions for `1.0.0` are all `1.0.0`.
 *
 * @example
 *
 * Given the version 2.3.5:
 *
 * baseMajor: 2.0.0
 * baseMinor: 2.3.0
 * ~baseMinor: ~2.3.0
 * previousPatch: 2.3.4
 * previousMinor: 2.2.0
 * previousMajor: 1.0.0
 * ^previousMajor: ^1.0.0
 * ^previousMinor: ^2.2.0
 * ~previousMajor: ~1.0.0
 * ~previousMinor: ~2.2.0
 *
 * @example
 *
 * Given the version 2.0.0-internal.2.3.5:
 *
 * baseMajor: 2.0.0-internal.2.0.0
 * baseMinor: 2.0.0-internal.2.3.0
 * ~baseMinor: \>=2.0.0-internal.2.3.0 \<2.0.0-internal.3.0.0
 * previousPatch: 2.0.0-internal.2.3.4
 * previousMinor: 2.0.0-internal.2.2.0
 * previousMajor: 2.0.0-internal.1.0.0
 * ^previousMajor: \>=2.0.0-internal.1.0.0 \<2.0.0-internal.2.0.0
 * ^previousMinor: \>=2.0.0-internal.2.2.0 \<2.0.0-internal.3.0.0
 * ~previousMajor: \>=2.0.0-internal.1.0.0 \<2.0.0-internal.1.1.0
 * ~previousMinor: \>=2.0.0-internal.2.2.0 \<2.0.0-internal.2.2.0
 *
 * @example
 *
 * Given the version 2.0.0-internal.2.0.0:
 *
 * baseMajor: 2.0.0-internal.2.0.0
 * baseMinor: 2.0.0-internal.2.0.0
 * ~baseMinor: \>=2.0.0-internal.2.0.0 \<2.0.0-internal.2.1.0
 * previousPatch: 2.0.0-internal.2.0.0
 * previousMinor: 2.0.0-internal.2.0.0
 * previousMajor: 2.0.0-internal.1.0.0
 * ^previousMajor: \>=2.0.0-internal.1.0.0 \<2.0.0-internal.2.0.0
 * ^previousMinor: \>=2.0.0-internal.2.0.0 \<2.0.0-internal.3.0.0
 * ~previousMajor: \>=2.0.0-internal.1.0.0 \<2.0.0-internal.1.1.0
 * ~previousMinor: \>=2.0.0-internal.2.0.0 \<2.0.0-internal.2.1.0
 */
export type PreviousVersionStyle =
	| "baseMajor"
	| "baseMinor"
	| "previousPatch"
	| "previousMinor"
	| "previousMajor"
	| "~baseMinor"
	| "^previousMajor"
	| "^previousMinor"
	| "~previousMajor"
	| "~previousMinor";

const configName = "flub";

/**
 * A cosmiconfig explorer to find the fluidBuild config. First looks for javascript config files and falls back to the
 * fluidBuild property in package.json. We create a single explorer here because cosmiconfig internally caches configs
 * for performance. The cache is per-explorer, so re-using the same explorer is a minor perf improvement.
 */
const configExplorer = cosmiconfigSync(configName, {
	searchPlaces: [
		// `${configName}.ts`,
		`${configName}.config.cjs`,
		`${configName}.config.js`,
		// Back-compat entries - we'll load settings from the old fluidBuild config files if present.
		"fluidBuild.config.cjs",
		"fluidBuild.config.js",
		"package.json",
	],
	packageProp: [
		configName,
		// Back-compat entry
		"fluidBuild",
	],
});

/**
 * Get an IFlubConfig from the flub property in a package.json file, or from flub.config.[c]js.
 *
 * @param configPath - The path to start searching for the config file. If a path to a file is provided, the file will
 * be loaded directly. Otherwise it will search upwards looking for config files until it finds one.
 * @param noCache - If true, the config cache will be cleared and the config will be reloaded.
 * @returns The flub config
 */
export function getFlubConfig(configPath: string, noCache = false): FlubConfig {
	if (noCache === true) {
		configExplorer.clearCaches();
	}

	const configResult = statSync(configPath).isFile()
		? configExplorer.load(configPath)
		: configExplorer.search(configPath);

	if (configResult === null || configResult === undefined) {
		throw new Error("No BuildProject configuration found.");
	}

	const config = Value.Parse(FlubConfig, configResult.config);

	if (config === undefined) {
		throw new Error(`No flub configuration found (configPath='${configPath}').`);
	}

	// Only version 1 of the config is supported. If any other value is provided, throw an error.
	if ((config.version ?? 1) !== 1) {
		throw new Error(
			`Configuration version is not supported: ${config?.version}. Config version must be 1.`,
		);
	}

	return config;
}

/**
 * Convenience function to extract the default interdependency range for a release group from the flub config. For
 * back-compat, it will also load the relevant setting from the fluid-build config.
 */
export function getDefaultInterdependencyRange(
	releaseGroup: ReleaseGroup | MonoRepo,
	context: Context,
): InterdependencyRangeSetting {
	const releaseGroupName = releaseGroup instanceof MonoRepo ? releaseGroup.name : releaseGroup;

	// Prefer to use the configuration in the flub config if available.
	const flubConfigRanges = context.flubConfig.bump?.defaultInterdependencyRange;
	const interdependencyRangeFromFlubConfig: InterdependencyRangeSetting | undefined =
		flubConfigRanges?.[releaseGroupName as ReleaseGroup];

	// Return early if the flub config had a range configured - no need to check/load other configs.
	if (interdependencyRangeFromFlubConfig !== undefined) {
		return interdependencyRangeFromFlubConfig;
	}

	// TODO: Re-enable this if needed.
	// For back-compat with earlier configs, try to load the default interdependency range from the fluid-build config.
	// This can be removed once we are no longer supporting release branches older than release/client/2.4
	// const fbConfig = context.fluidBuildConfig.repoPackages?.[releaseGroupName];
	// const interdependencyRangeFromFluidBuildConfig: InterdependencyRangeSetting =
	// 	fbConfig !== undefined && typeof fbConfig === "object" && !Array.isArray(fbConfig)
	// 		? fbConfig.defaultInterdependencyRange
	// 		: undefined;

	// Once the back-compat code above is removed, this should change to
	// return interdependencyRangeFromFlubConfig ?? DEFAULT_INTERDEPENDENCY_RANGE
	return "^" as InterdependencyRangeSetting;
}
