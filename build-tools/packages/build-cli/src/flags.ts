/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isVersionBumpTypeExtended } from "@fluid-tools/version-tools";
import { supportedMonoRepoValues } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import * as semver from "semver";

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
    description: "release group",
    options: [...supportedMonoRepoValues()],
    parse: async (str: string, _: never) => str.toLowerCase(),
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
