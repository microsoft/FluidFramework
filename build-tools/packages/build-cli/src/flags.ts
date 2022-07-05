/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
    options: ["Azure", "Client", "Server"], // releaseGroupOptions,
    parse: async (str: string, _: never) => str.charAt(0).toUpperCase() + str.slice(1),
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
});

/**
 * A re-usable CLI flag to parse bump types.
 */
export const bumpTypeFlag = Flags.build({
    char: "t",
    description: "bump type",
    options: ["major", "minor", "patch", "current"],
    default: "current",
    required: true,
});
