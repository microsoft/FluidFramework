/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    isVersionBumpType,
    isVersionBumpTypeExtended,
    isVersionScheme,
} from "@fluid-tools/version-tools";
import { supportedMonoRepoValues } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import * as semver from "semver";
import { DependencyUpdateType } from "./lib";
import { isReleaseGroup } from "./releaseGroups";

/**
 * A re-usable CLI flag to parse the root directory of the Fluid repo.
 */
export const rootPathFlag = Flags.build({
    char: "r",
    description: "Root directory of the Fluid repo (default: env _FLUID_ROOT_).",
    env: "_FLUID_ROOT_",
    hidden: true,
});

/**
 * A re-usable CLI flag to parse release groups.
 */
export const releaseGroupFlag = Flags.build({
    char: "g",
    description: "Name of the release group",
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
 * A re-usable CLI flag to parse package names.
 */
export const packageSelectorFlag = Flags.build({
    char: "p",
    description: "Name of package.",
    multiple: false,
});

/**
 * A re-usable CLI flag to parse semver ranges.
 */
export const semverRangeFlag = Flags.build<string | undefined>({
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
export const bumpTypeExtendedFlag = Flags.build({
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
export const bumpTypeFlag = Flags.build({
    char: "t",
    description: "Version bump type.",
    options: ["major", "minor", "patch"],
    parse: async (input) => {
        if (isVersionBumpType(input)) {
            return input;
        }
    },
});

/**
 * A re-usable CLI flag to parse dependency update types.
 */
export const dependencyUpdateTypeFlag = Flags.build({
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
export const versionSchemeFlag = Flags.build({
    description: "Version scheme to use.",
    options: ["semver", "internal", "virtualPatch"],
    parse: async (input) => {
        if (isVersionScheme(input)) {
            return input;
        }
    },
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
 * All of the check flags can be used like this:
 *
 * ```
 * static flags = {
 *     ...checkFlags,
 * };
 * ```
 *
 * @example
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
        default: true,
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
