/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as semver from "semver";

import { VersionBumpType, VersionChangeType, isVersionBumpType } from "@fluid-tools/version-tools";

import { commonOptionString, parseOption } from "../common/commonOptions";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import { MonoRepoKind, supportedMonoRepoValues } from "../common/monoRepo";
import { bumpDependencies, cleanPrereleaseDependencies } from "./bumpDependencies";
import { bumpVersionCommand } from "./bumpVersion";
import { Context } from "./context";
import { createReleaseBump } from "./createReleaseBump";
import { GitRepo } from "./gitRepo";
import { releaseVersion } from "./releaseVersion";
import { showVersions } from "./showVersions";
import { fatal } from "./utils";
import { writeReleaseVersions } from "./writeReleaseVersions";

function printUsage() {
    console.log(
        `
Usage: fluid-bump-version <options>
Options:
  -b --bump [<pkg>[=<type>]]     Bump the package version of specified package or monorepo (default: client)
  -d --dep [<pkg>[=<version>]]   Bump the dependencies version of specified package or monorepo (default: client)
  -r --release [<pkg>[=<type>]]  Release and bump version of specified package or monorepo and dependencies (default: client)
     --releaseBump <type>        Bump the versions that would be released on the current main/next branch
  -u --update                    Update prerelease dependencies for released packages
     --version [<pkg>[=<type>]]  Collect and show version of specified package or monorepo and dependencies (default: client)
     --virtualPatch              Use a virtual patch number for beta versioning (0.<major>.<minor>00<patch>)
     --writeReleaseVersions      Write out the latest versions of packages if the repo were to be released in its current state to versions.json
${commonOptionString}
`,
    );
}

const paramBumpDepPackages = new Map<string, string | undefined>();
let paramReleaseBump = false;
let paramLocal = true;
let paramReleaseName: string | undefined;
let paramReleaseVersion: VersionBumpType | undefined;
let paramClean = false;
let paramCommit = true;
let paramVersionName: string | undefined;
let paramVersion: semver.SemVer | undefined;
let paramBumpName: string | undefined;
let paramBumpVersion: VersionChangeType | undefined;
let paramUpdate = false;
let paramVirtualPatch = false;
let paramWriteReleaseVersions = false;

function parseNameVersion(arg: string | undefined) {
    let name = arg;
    let extra = false;

    if (name === undefined || name.startsWith("--")) {
        name = MonoRepoKind.Client;
    } else {
        extra = true;
    }

    const split = name.split("=");
    name = split[0];
    const v = split[1];

    if (name !== undefined) {
        for (const monoRepo of supportedMonoRepoValues()) {
            if (name.toLowerCase() === monoRepo.toLowerCase()) {
                name = monoRepo;
            }
        }
    }

    let version: VersionChangeType | undefined;
    if (v !== undefined) {
        if (isVersionBumpType(v)) {
            version = v;
        } else {
            const parsedVersion = semver.parse(v);
            if (!parsedVersion) {
                fatal(`Invalid version ${v}`);
            }
            version = parsedVersion;
        }
    }
    return { name, version, extra };
}

function parseOptions(argv: string[]) {
    let error = false;
    for (let i = 2; i < process.argv.length; i++) {
        const argParsed = parseOption(argv, i);
        if (argParsed < 0) {
            error = true;
            break;
        }
        if (argParsed > 0) {
            i += argParsed - 1;
            continue;
        }

        const arg = process.argv[i];

        if (arg === "-?" || arg === "--help") {
            printUsage();
            process.exit(0);
        }

        if (arg === "-d" || arg === "--dep") {
            const depArg = process.argv[++i];
            if (depArg === undefined) {
                console.error("ERROR: Missing arguments for --dep");
                process.exit(-1);
            }
            const split = depArg.split("=");
            const dep = split[0];
            const version = split[1];

            paramBumpDepPackages.set(dep, version);
            continue;
        }

        if (arg === "--releaseBump") {
            paramReleaseBump = true;
            paramClean = true;
            const nextArg = process.argv[i + 1];
            if (nextArg !== undefined && isVersionBumpType(nextArg)) {
                i++;
                paramReleaseVersion = nextArg;
            }
            continue;
        }
        if (arg === "--local") {
            paramLocal = false;
            continue;
        }

        if (arg === "--cleanOnError") {
            paramClean = true;
            continue;
        }

        if (arg === "--nocommit") {
            paramCommit = false;
            continue;
        }

        if (arg === "-r" || arg === "--release") {
            if (paramReleaseName) {
                fatal("Can't do multiple release at once");
            }
            const { name, version, extra } = parseNameVersion(process.argv[i + 1]);

            paramReleaseName = name;

            if (version) {
                if (isVersionBumpType(version)) {
                    paramReleaseVersion = version;
                } else {
                    fatal(`Invalid version ${version} for flag --release`);
                }
            }

            if (extra) {
                i++;
            }
            continue;
        }

        if (arg === "--version") {
            if (paramVersionName) {
                fatal("Can't do multiple release at once");
            }
            const { name, version, extra } = parseNameVersion(process.argv[i + 1]);

            paramVersionName = name;
            if (version) {
                if (typeof version !== "string") {
                    paramVersion = version;
                } else {
                    fatal(`Invalid version ${version} for flag --version`);
                }
            }

            if (extra) {
                i++;
            }
            continue;
        }

        if (arg === "-b" || arg === "--bump") {
            if (paramBumpName) {
                fatal("Can't do multiple bump at once");
            }

            const { name, version, extra } = parseNameVersion(process.argv[i + 1]);

            paramBumpName = name;
            paramBumpVersion = version;
            if (extra) {
                i++;
            }
            continue;
        }

        if (arg === "-u" || arg === "--update") {
            paramUpdate = true;
            continue;
        }

        if (arg === "--virtualPatch") {
            paramVirtualPatch = true;
            continue;
        }

        if (arg === "--writeReleaseVersions") {
            paramWriteReleaseVersions = true;
            continue;
        }

        console.error(`ERROR: Invalid arguments ${arg}`);
        error = true;
        break;
    }

    if (error) {
        printUsage();
        process.exit(-1);
    }
}

function checkFlagsConflicts() {
    let command: string | undefined = undefined;
    if (paramReleaseBump) {
        command = "releaseBump";
    }
    if (paramBumpDepPackages.size) {
        if (command !== undefined) {
            fatal(`Conflicting switches --dep and --${command}`);
        }
        command = "dep";
    }
    if (paramReleaseName) {
        if (command !== undefined) {
            fatal(`Conflicting switches --release and --${command}`);
        }
        command = "release";
    }
    if (paramVersionName) {
        if (command !== undefined) {
            fatal(`Conflicting switches --version and --${command}`);
        }
        command = "version";
    }
    if (paramBumpName) {
        if (command !== undefined) {
            fatal(`Conflicting switches --bump and --${command}`);
        }
        command = "bump";
    }
    if (paramUpdate) {
        if (command !== undefined) {
            fatal(`Conflicting switches --update and --${command}`);
        }
        command = "update";
    }
    if (paramWriteReleaseVersions) {
        if (command !== undefined) {
            fatal(`Conflicting switches --currentVersions and --${command}`);
        }
        command = "writeReleaseVersions";
    }
    if (command === undefined) {
        fatal("Missing command flags --branch/--release/--dep/--bump/--version");
    }
    return command;
}

/**
 * Load the repo and either do version bump or dependencies bump
 */
async function main() {
    parseOptions(process.argv);
    const resolvedRoot = await getResolvedFluidRoot();
    console.log(`Repo: ${resolvedRoot}`);
    const gitRepo = new GitRepo(resolvedRoot);
    const context = new Context(
        gitRepo,
        "github.com/microsoft/FluidFramework",
        await gitRepo.getCurrentBranchName(),
    );
    try {
        const command = checkFlagsConflicts();

        // Make sure we are operating on a clean repo
        const status = await context.gitRepo.getStatus();
        if (status !== "") {
            fatal(`Local repo is dirty\n${status}`);
        }

        switch (command) {
            case "releaseBump":
                await createReleaseBump(
                    MonoRepoKind.Client,
                    context,
                    paramReleaseVersion,
                    paramVirtualPatch,
                );
                break;
            case "dep":
                console.log("Bumping dependencies");
                await bumpDependencies(
                    context,
                    paramBumpDepPackages,
                    /*updateLock*/ paramLocal,
                    /*commit*/ paramCommit,
                    "Bump dependencies version",
                );
                break;
            case "release":
                await releaseVersion(
                    context,
                    paramReleaseName!,
                    paramLocal,
                    paramVirtualPatch,
                    paramReleaseVersion,
                );
                break;
            case "version":
                await showVersions(context, paramVersionName!, paramVersion);
                break;
            case "bump":
                await bumpVersionCommand(
                    context,
                    paramBumpName!,
                    paramBumpVersion ?? "patch",
                    paramCommit,
                    paramVirtualPatch,
                );
                break;
            case "update":
                await cleanPrereleaseDependencies(context, paramLocal, paramCommit);
                break;
            case "writeReleaseVersions":
                await writeReleaseVersions(context);
                break;
        }
    } catch (e: any) {
        if (!e.fatal) {
            throw e;
        }
        console.error(`ERROR: ${e.message}`);
        if (paramClean) {
            await context.cleanUp();
        }
        process.exit(-2);
    }
}

main().catch((e) => {
    console.error("ERROR: unexpected error", JSON.stringify(e, undefined, 2));
    if (e.stack) {
        console.error(`Stack:\n${e.stack}`);
    }
});
