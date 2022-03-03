/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { commonOptionString, parseOption } from "../common/commonOptions";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import { MonoRepoKind } from "../common/monoRepo";
import { GitRepo, fatal } from "./utils";
import { Context, isVersionBumpType, VersionBumpType, VersionChangeType } from "./context";
import { bumpVersionCommand } from "./bumpVersion";
import { createReleaseBranch } from "./createBranch";
import { releaseVersion } from "./releaseVersion";
import { showVersions } from "./showVersions";
import { bumpDependencies, cleanPrereleaseDependencies } from "./bumpDependencies";
import * as semver from "semver";

function printUsage() {
    console.log(
        `
Usage: fluid-bump-version <options>
Options:
     --branch                    Create release branch and bump the version that would be released on main branch
  -b --bump [<pkg>[=<type>]]     Bump the package version of specified package or monorepo (default: client)
  -d --dep [<pkg>[=<version>]]   Bump the dependencies version of specified package or monorepo (default: client)
  -r --release [<pkg>[=<type>]]  Release and bump version of specified package or monorepo and dependencies (default: client)
  -u --update                    Update prerelease dependencies for released packages
     --version [<pkg>[=<type>]]  Collect and show version of specified package or monorepo and dependencies (default: client)
     --virtualPatch              Use a virtual patch number for beta versioning (0.<major>.<minor>00<patch>)
${commonOptionString}
`);
}

const paramBumpDepPackages = new Map<string, string | undefined>();
let paramBranch = false;
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

function parseNameVersion(arg: string | undefined) {
    let name = arg;
    let extra = false;

    if (name === undefined || name.startsWith("--")) {
        name = MonoRepoKind[MonoRepoKind.Client];
    } else {
        extra = true;
    }

    const split = name.split("=");
    name = split[0];
    let v = split[1];

    if (name.toLowerCase() === MonoRepoKind[MonoRepoKind.Client].toLowerCase()) {
        name = MonoRepoKind[MonoRepoKind.Client];
    } else if (name.toLowerCase() === MonoRepoKind[MonoRepoKind.Server].toLowerCase()) {
        name = MonoRepoKind[MonoRepoKind.Server];
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

            if (dep.toLowerCase() === MonoRepoKind[MonoRepoKind.Client].toLowerCase()) {
                paramBumpDepPackages.set(MonoRepoKind[MonoRepoKind.Client], version);
            } else if (dep.toLowerCase() === MonoRepoKind[MonoRepoKind.Server].toLowerCase()) {
                paramBumpDepPackages.set(MonoRepoKind[MonoRepoKind.Server], version);
            } else {
                paramBumpDepPackages.set(dep, version);
            }
            continue;
        }

        if (arg === "--branch") {
            paramBranch = true;
            paramClean = true;
            break;
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
                if (typeof version === "string") {
                    paramReleaseVersion = version;
                } else {
                    fatal(`Invalid version ${version} for flag --release`);
                }
            }

            if (extra) { i++; }
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

            if (extra) { i++; }
            continue;
        }

        if (arg === "-b" || arg === "--bump") {
            if (paramBumpName) {
                fatal("Can't do multiple bump at once");
            }

            const { name, version, extra } = parseNameVersion(process.argv[i + 1]);

            paramBumpName = name;
            paramBumpVersion = version;
            if (extra) { i++; }
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
    let command = undefined;
    if (paramBranch) {
        command = "branch";
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
    const context = new Context(gitRepo, "github.com/microsoft/FluidFramework", await gitRepo.getCurrentBranchName());
    try {
        const command = checkFlagsConflicts();

        // Make sure we are operating on a clean repo
        const status = await context.gitRepo.getStatus();
        if (status !== "") {
            fatal(`Local repo is dirty\n${status}`);
        }

        switch (command) {
            case "branch":
                await createReleaseBranch(context, paramVirtualPatch);
                break;
            case "dep":
                console.log("Bumping dependencies");
                await bumpDependencies(context, "Bump dependencies version", paramBumpDepPackages, paramLocal, paramCommit);
                break;
            case "release":
                await releaseVersion(context, paramReleaseName!, paramLocal, paramVirtualPatch, paramReleaseVersion);
                break;
            case "version":
                await showVersions(context, paramVersionName!, paramVersion);
                break;
            case "bump":
                await bumpVersionCommand(context, paramBumpName!, paramBumpVersion ?? "patch", paramCommit, paramVirtualPatch);
                break;
            case "update":
                await cleanPrereleaseDependencies(context, paramLocal, paramCommit);
                break;
        }
    } catch (e) {
        if (!e.fatal) { throw e; }
        console.error(`ERROR: ${e.message}`);
        if (paramClean) {
            await context.cleanUp();
        }
        process.exit(-2);
    }
}

main().catch(e => {
    console.error("ERROR: unexpected error", JSON.stringify(e, undefined, 2))
    if (e.stack) {
        console.error(`Stack:\n${e.stack}`);
    }
});
