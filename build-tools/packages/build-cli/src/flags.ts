/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { supportedMonoRepoValues, isVersionBumpTypeExtended } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";

/**
 * A re-usable CLI flag to parse the root directory of the Fluid repo.
 */
export const rootPathFlag = Flags.build({
    char: "r",
    description: "Root directory of the Fluid repo (default: env _FLUID_ROOT_).",
    env: "_FLUID_ROOT_",
    // required: true,
});

/**
 * A re-usable CLI flag to parse release groups.
 */
export const releaseGroupFlag = Flags.build({
    char: "g",
    description: "release group",
    options: [...supportedMonoRepoValues()], // releaseGroupOptions,
    parse: async (str: string, _: never) => str.toLowerCase(),
    // Can't be used with individual packages.
    exclusive: ["p"],
});

/**
 * A re-usable CLI flag to parse package name/version specifiers.
 */
export const packageSelectorFlag = Flags.build({
    char: "p",
    description: "package",
    // Can't be used with release groups.
    exclusive: ["g"],
    multiple: false,
    parse: async (input) => {
        // TODO: This function was inherited from previous build-tools commands. We should re-evaluate whether we want
        // to support parsing versions out of strings or make it a separate explicit argument.

        // If the package string includes a "=", then the string is assumed to be a package name and a version together.
        const split = input.split("=");
        const pkg = split[0];
        const version = split[1];
        return { pkg, version };
    },
});

/**
 * A re-usable CLI flag to parse bump types.
 */
export const bumpTypeFlag = Flags.build({
    char: "t",
    description: "Version bump type.",
    options: ["major", "minor", "patch", "current"],
    parse: async (input): Promise<string | undefined> => {
        if (isVersionBumpTypeExtended(input)) {
            return input;
        }
    },
});

/**
 * A re-usable CLI flag to parse version schemes used to adjust versions.
 */
export const versionSchemeFlag = Flags.build({
    char: "S",
    description: "Version scheme to use.",
    options: ["semver", "internal", "virtualPatch"],
    default: "semver",
});
