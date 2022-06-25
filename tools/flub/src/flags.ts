import { Flags } from "@oclif/core";
import {
    MonoRepoKind,
    isMonoRepoKind,
    supportedMonoRepoValues,
    sentenceCase,
} from "@fluidframework/build-tools/src/common/monoRepo";
import { VersionBumpTypeExtended } from "@fluidframework/build-tools/src/bumpVersion/context";
import type { OptionFlag } from "@oclif/core/lib/interfaces";

// function getTeam(): Promise<string> {
//     // imagine this reads a configuration file or something to find the team
// }

// export const wrapFlag = (merge?: OptionFlag<string>) => {
//     Flags
// }

export const rootPathFlag = Flags.build({
    char: "r",
    description: "root path",
    env: "_FLUID_ROOT_",
    // required: true,
});

const releaseGroupOptions = [...supportedMonoRepoValues()].map((s) => s.toString().toLowerCase());

console.log(releaseGroupOptions);

export const releaseGroupFlag = Flags.build({
    char: "g",
    description: "release group",
    options: releaseGroupOptions,
    parse: async (input, _) => sentenceCase(input),
    exclusive: ["p"],
});

export const packageSelectorFlag = Flags.build({
    char: "p",
    description: "package",
    exclusive: ["g"],
});

export const bumpTypeFlag = Flags.build({
    char: "t",
    description: "bump type",
    options: ["major", "minor", "patch", "current"],
    default: "current",
    required: true,
});

export const packageFilterFlags = () => {
    return {
        releaseGroup: releaseGroupFlag(),
        package: packageSelectorFlag(),
    };
};
