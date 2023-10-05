/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import * as semver from "semver";

import { supportedMonoRepoValues } from "@fluidframework/build-tools";

import {
	isVersionBumpType,
	isVersionBumpTypeExtended,
	isVersionScheme,
	VersionBumpType,
	VersionScheme,
} from "@fluid-tools/version-tools";

import { DependencyUpdateType } from "./lib";
import { isReleaseGroup, ReleaseGroup } from "./releaseGroups";

/**
 * A re-usable CLI flag to parse the root directory of the Fluid repo.
 */
export const rootPathFlag = Flags.custom({
	description: "Root directory of the Fluid repo (default: env _FLUID_ROOT_).",
	env: "_FLUID_ROOT_",
	hidden: true,
});

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
		"Name of package. You can use scoped or unscoped package names. For example, both @fluid-tools/markdown-magic and markdown-magic are valid.",
	multiple: false,
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
			"Run on all packages and release groups. Cannot be used with --all, --dir, --releaseGroup, or --releaseGroupRoot.",
		exclusive: ["dir", "packages", "releaseGroup", "releaseGroupRoot"],
		helpGroup: "PACKAGE SELECTION",
	}),
	dir: Flags.directory({
		description:
			"Run on the package in this directory. Cannot be used with --all, --dir, --releaseGroup, or --releaseGroupRoot.",
		exclusive: ["packages", "releaseGroup", "releaseGroupRoot", "all"],
		helpGroup: "PACKAGE SELECTION",
	}),
	packages: Flags.boolean({
		description:
			"Run on all independent packages in the repo. Cannot be used with --all, --dir, --releaseGroup, or --releaseGroupRoot.",
		default: false,
		exclusive: ["dir", "releaseGroup", "releaseGroupRoot", "all"],
		helpGroup: "PACKAGE SELECTION",
	}),
	releaseGroup: releaseGroupWithAllFlag({
		description:
			"Run on all child packages within the specified release groups. This does not include release group root packages. To include those, use the --releaseGroupRoot argument. Cannot be used with --all, --dir, or --packages.",
		exclusive: ["all", "dir", "packages"],
		helpGroup: "PACKAGE SELECTION",
		multiple: true,
	}),
	releaseGroupRoot: releaseGroupWithAllFlag({
		description:
			"Run on the root package of the specified release groups. This does not include any child packages within the release group. To include those, use the --releaseGroup argument. Cannot be used with --all, --dir, or --packages.",
		exclusive: ["all", "dir", "packages"],
		helpGroup: "PACKAGE SELECTION",
		multiple: true,
		char: undefined,
		aliases: ["releaseGroupRoots"],
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
	readonly dir: string | undefined;
	readonly packages: boolean;
	readonly releaseGroup: string[] | undefined;
	readonly releaseGroupRoot: string[] | undefined;
}

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
