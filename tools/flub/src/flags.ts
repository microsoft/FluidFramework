import { Flags } from "@oclif/core";
import {
    MonoRepoKind,
    isMonoRepoKind,
    supportedMonoRepoValues,
} from "@fluidframework/build-tools/src/common/monoRepo";

// function getTeam(): Promise<string> {
//     // imagine this reads a configuration file or something to find the team
// }

export const rootPathFlag = Flags.build({
    char: "r",
    description: "root path",
    env: "_FLUID_ROOT_"
});

export const releaseGroupFlag = Flags.build({
    char: "g",
    description: "release group",
    options: [...supportedMonoRepoValues()]
        .map((s) => s.toString().toLowerCase())
        .filter(s => Boolean(s)),
    parse: async (input, _) => input.toLowerCase(),
    exclusive: ["p"]
});

export const packageSelectorFlag = Flags.build({
    char: "p",
    description: "package",
    exclusive: ["g"]
});

export const bumpTypeFlag = Flags.build({
    char: "t",
    description: "bump type",
    options: ["current", "patch", "minor", "major"],
    default: "current"
});

