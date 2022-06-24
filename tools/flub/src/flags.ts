import { Flags } from "@oclif/core";
import {
    MonoRepoKind,
    isMonoRepoKind,
    supportedMonoRepoValues,
    sentenceCase,
} from "@fluidframework/build-tools/src/common/monoRepo";
import { VersionBumpTypeExtended } from "@fluidframework/build-tools/src/bumpVersion/context";

// function getTeam(): Promise<string> {
//     // imagine this reads a configuration file or something to find the team
// }

export const rootPathFlag = Flags.build({
    char: "r",
    description: "root path",
    env: "_FLUID_ROOT_",
});

export const releaseGroupFlag = Flags.build({
    char: "g",
    description: "release group",
    options: [...supportedMonoRepoValues()]
        .map((s) => s.toString().toLowerCase())
        .filter((s) => Boolean(s)),
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
