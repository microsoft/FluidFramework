/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import * as semver from "semver";

// eslint-disable-next-line import/no-deprecated
import { MonoRepoKind } from "./library/index.js";

/**
 * An iterator that returns only the Enum values of MonoRepoKind.
 * @deprecated should switch to ReleaseGroup.  Currently the only difference is "azure" not in ReleaseGroup.
 */
// eslint-disable-next-line import/no-deprecated
function* supportedMonoRepoValues(): IterableIterator<MonoRepoKind> {
	// eslint-disable-next-line import/no-deprecated
	for (const [, flag] of Object.entries(MonoRepoKind)) {
		yield flag;
	}
}

import {
	VersionBumpType,
	VersionScheme,
	isVersionBumpType,
	isVersionBumpTypeExtended,
	isVersionScheme,
} from "@fluid-tools/version-tools";

import type { DependencyUpdateType } from "./library/index.js";
import { ReleaseGroup, isReleaseGroup } from "./releaseGroups.js";

/**
 * A re-usable CLI flag to parse release groups.
 */
export const releaseGroupFlag = Flags.custom<ReleaseGroup>({
	char: "g",
	description: "Name of a release group.",
	aliases: ["releaseGroups"],
	options: [...supportedMonoRepoValues()],
	parse: async (str: string) => {
		const group = str.toLowerCase();
		if (!isReleaseGroup(group)) {
			throw new TypeError(`Not a release group: ${str}`);
		}

		return group;
	},
});

/**
 * A re-usable CLI flag to parse release groups along with the value "all" to indicate all release groups.
 */
export const releaseGroupWithAllFlag = Flags.custom<ReleaseGroup | "all">({
	char: "g",
	description: "Name of a release group.",
	aliases: ["releaseGroups"],
	options: [...supportedMonoRepoValues(), "all"],
	parse: async (str: string) => {
		const group = str.toLowerCase();
		if (group !== "all" && !isReleaseGroup(group)) {
			throw new TypeError(`Not a release group: ${str}`);
		}

		return group;
	},
});

/**
 * A re-usable CLI flag to parse package names.
 */
export const packageSelectorFlag = Flags.custom({
	char: "p",
	description:
		"Name of package. You can use scoped or unscoped package names. For example, both @fluid-tools/benchmark and benchmark are valid.",
	multiple: false,
});

/**
 * A re-usable CLI flag to parse semver version strings. Values are verified to be valid semvers during flag parsing.
 */
export const semverFlag = Flags.custom<semver.SemVer, { loose?: boolean }>({
	description:
		"A semantic versioning (semver) version string. Values are verified to be valid semvers during flag parsing.",
	parse: async (input, _, opts) => {
		const parsed = semver.parse(input, opts.loose);
		if (parsed === null) {
			throw new Error(`Invalid semver: ${input}`);
		}
		return parsed;
	},
});

/**
 * A re-usable CLI flag to parse semver ranges.
 */
export const semverRangeFlag = Flags.custom<string | undefined>({
	description: "A semver version range string.",
	multiple: false,
	parse: async (input) => {
		const range = semver.validRange(input);
		return range === null ? undefined : input;
	},
});

/**
 * A re-usable CLI flag to parse bump types.
 */
export const bumpTypeExtendedFlag = Flags.custom({
	char: "t",
	description: "Version bump type.",
	options: ["major", "minor", "patch", "current"],
	parse: async (input) => {
		if (isVersionBumpTypeExtended(input)) {
			return input;
		}
	},
});

/**
 * A re-usable CLI flag to parse bump types.
 */
export const bumpTypeFlag = Flags.custom<VersionBumpType>({
	char: "t",
	description: "Version bump type.",
	options: ["major", "minor", "patch"],
	parse: async (input) => {
		if (isVersionBumpType(input)) {
			return input;
		}

		throw new Error(`Invalid version bump type: ${input}`);
	},
});

/**
 * A re-usable CLI flag to parse dependency update types.
 */
export const dependencyUpdateTypeFlag = Flags.custom({
	char: "t",
	description: "Version bump type.",
	options: ["latest", "newest", "greatest", "minor", "patch", "@next", "@canary"],
	parse: async (input) => {
		return input as DependencyUpdateType;
	},
});

/**
 * A re-usable CLI flag to parse version schemes used to adjust versions.
 */
export const versionSchemeFlag = Flags.custom<VersionScheme | undefined>({
	description: "Version scheme to use.",
	options: ["semver", "internal", "virtualPatch"],
	parse: async (input) => {
		if (isVersionScheme(input)) {
			return input;
		}
	},
});

/**
 * A re-usable CLI flag used to enable test-only behavior in commands. The flag is hidden because it is intended to only
 * be used for internal testing.
 */
export const testModeFlag = Flags.boolean({
	default: false,
	description: "Enables test mode. This flag enables other flags used for testing.",
	hidden: true,
	helpGroup: "TESTING",
});

/**
 * Reusable flags for cases where a command typically checks something before taking action. They default to true, but
 * can be negated with `--no-<flag>`. Intended to be used with {@link skipCheckFlag}.
 *
 * @remarks
 *
 * You must use these flags in your command logic in order for them to have any effect.
 *
 * @example
 *
 * All of the check flags can be used like this:
 *
 * ```
 * static flags = {
 *     ...checkFlags,
 * };
 * ```
 *
 * @example
 *
 * You can also use them individually like so:
 *
 * ```
 * static flags = {
 *     commit: checkFlags.commit,
 *     install: checkFlags.install,
 * };
 * ```
 */
export const checkFlags = {
	commit: Flags.boolean({
		allowNo: true,
		default: true,
		description: "Commit changes to a new branch.",
	}),
	install: Flags.boolean({
		allowNo: true,
		default: true,
		description: "Update lockfiles by running 'npm install' automatically.",
	}),
	branchCheck: Flags.boolean({
		allowNo: true,
		default: true,
		description: "Check that the current branch is correct.",
	}),
	updateCheck: Flags.boolean({
		allowNo: true,
		default: true,
		description: "Check that the local repo is up to date with the remote.",
	}),
	policyCheck: Flags.boolean({
		allowNo: true,
		default: true, // This value isn't used directly; the default is based on the branch. See comment in run method.
		description: "Check that the local repo complies with all policy.",
	}),
};

/**
 * A reusable flag intended to be used with {@link checkFlags} to provide a single flag that can be used to skip all
 * checks.
 *
 * @remarks
 *
 * You must use this flag in conjuction with the {@link checkFlags} in your command logic in order for it to have any
 * effect.
 */
export const skipCheckFlag = Flags.boolean({
	char: "x",
	default: false,
	description: "Skip all checks.",
	exclusive: ["install", "commit", "branchCheck", "updateCheck", "policyCheck"],
});

/**
 * A set of flags that can be used to select packages in the repo. These flags provide a common way for commands to
 * implement package selection and filtering.
 */
export const selectionFlags = {
	all: Flags.boolean({
		description:
			"Run on all packages and release groups. Cannot be used with --dir, --packages, --releaseGroup, or --releaseGroupRoot.",
		exclusive: ["dir", "packages", "releaseGroup", "releaseGroupRoot"],
		helpGroup: "PACKAGE SELECTION",
	}),
	dir: Flags.directory({
		description: "Run on the package in this directory. Cannot be used with --all.",
		exclusive: ["all"],
		helpGroup: "PACKAGE SELECTION",
		multiple: true,
	}),
	packages: Flags.boolean({
		description: "Run on all independent packages in the repo. Cannot be used with --all.",
		default: false,
		exclusive: ["all"],
		helpGroup: "PACKAGE SELECTION",
	}),
	releaseGroup: releaseGroupWithAllFlag({
		description:
			"Run on all child packages within the specified release groups. This does not include release group root packages. To include those, use the --releaseGroupRoot argument. Cannot be used with --all.",
		exclusive: ["all"],
		helpGroup: "PACKAGE SELECTION",
		multiple: true,
	}),
	releaseGroupRoot: releaseGroupWithAllFlag({
		description:
			"Run on the root package of the specified release groups. This does not include any child packages within the release group. To include those, use the --releaseGroup argument. Cannot be used with --all.",
		exclusive: ["all"],
		helpGroup: "PACKAGE SELECTION",
		multiple: true,
		char: undefined,
		aliases: ["releaseGroupRoots"],
	}),
	changed: Flags.boolean({
		description:
			"Select packages that have changed when compared to a base branch. Use the --branch option to specify a different base branch. Cannot be used --all.",
		exclusive: ["all"],
		required: false,
		default: false,
		helpGroup: "PACKAGE SELECTION",
	}),
	branch: Flags.string({
		description:
			"Select only packages that have been changed when compared to this base branch. Can only be used with --changed.",
		dependsOn: ["changed"],
		relationships: [
			{
				type: "all",
				flags: [
					{
						name: "changed",
						// Only make the "branch" flag required if the "changed" flag is passed. This enables us to have a default
						// value on the flag without oclif complaining that "--changed must be passed if --branch is used."
						when: async (flags): Promise<boolean> => {
							return !(flags.changed === undefined);
						},
					},
				],
			},
		],
		required: false,
		default: "main",
		helpGroup: "PACKAGE SELECTION",
	}),
};

/**
 * This interface is used for type enforcement of selection flags. The default oclif typing is complex and difficult to
 * simplify, so this type just mirrors the object above with simpler typing. This should ONLY be used when processing
 * raw flags.
 *
 * @internal
 */
export interface selectionFlags {
	readonly all: boolean;
	readonly dir: string[] | undefined;
	readonly packages: boolean;
	readonly releaseGroup: string[] | undefined;
	readonly releaseGroupRoot: string[] | undefined;
	readonly changed: boolean;
	readonly branch: string;
}

export const defaultSelectionKinds = ["dir", "all"] as const;

/**
 * A type representing the possible ways a command can set its default selection criteria when no selection flags are
 * used.
 */
export type PackageSelectionDefault = (typeof defaultSelectionKinds)[number] | undefined;

/**
 * A set of flags that can be used to filter selected packages in the repo.
 */
export const filterFlags = {
	private: Flags.boolean({
		description:
			"Only include private packages. Use --no-private to exclude private packages instead.",
		allowNo: true,
		helpGroup: "PACKAGE FILTER",
	}),
	scope: Flags.string({
		description:
			"Package scopes to filter to. If provided, only packages whose scope matches the flag will be included. Cannot be used with --skipScope.",
		exclusive: ["skipScope"],
		multiple: true,
		helpGroup: "PACKAGE FILTER",
	}),
	skipScope: Flags.string({
		description:
			"Package scopes to filter out. If provided, packages whose scope matches the flag will be excluded. Cannot be used with --scope.",
		exclusive: ["scope"],
		aliases: ["no-scope"],
		multiple: true,
		helpGroup: "PACKAGE FILTER",
	}),
};

/**
 * This interface is used for type enforcement of filter flags. The default oclif typing is complex and difficult to
 * simplify, so this type just mirrors the object above with simpler typing. This should ONLY be used when processing
 * raw flags.
 *
 * @internal
 */
export interface filterFlags {
	readonly private: boolean;
	readonly scope: string[] | undefined;
	readonly skipScope: string[] | undefined;
}

/**
 * A reusable flag for GitHub tokens.
 */
export const githubTokenFlag = Flags.custom({
	description:
		"GitHub access token. This parameter should be passed using the GITHUB_TOKEN environment variable for security purposes.",
	env: "GITHUB_TOKEN",
});

/**
 * A reusable flag to indicate the command is running in the GitHub Actions environment. This value is typically parsed
 * from the GITHUB_ACTIONS environment variable but can be set manually for testing.
 */
export const githubActionsFlag = Flags.boolean({
	description:
		"Set to true to output logs in a GitHub Actions-compatible format. This value will be set to true automatically when running in GitHub Actions.",
	env: "GITHUB_ACTIONS",
});
