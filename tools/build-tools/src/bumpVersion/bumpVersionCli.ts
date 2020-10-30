/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { commonOptionString, parseOption } from "../common/commonOptions";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import { MonoRepoKind } from "../common/monoRepo";
import { GitRepo, fatal } from "./utils";
import { Context, VersionBumpType, VersionChangeType } from "./context";
import { bumpVersion } from "./bumpVersion";
import { createReleaseBranch } from "./createBranch";
import { releaseVersion, getPackageShortName } from "./releaseVersion";
import { showVersions } from "./showVersions";
import { bumpDependencies } from "./bumpDependencies";
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
     --version [<pkg>[=<type>]]  Collect and show version of specified package or monorepo and dependencies (default: client)
${commonOptionString}
`);
}

const paramBumpDepPackages = new Map<string, string | undefined>();
let paramBranch = false;
let paramPush = true;
let paramPublishCheck = true;
let paramReleaseName: string | undefined;
let paramReleaseVersion: VersionBumpType | undefined;
let paramClean = false;
let paramCommit = false;
let paramVersionName: string | undefined;
let paramVersion: semver.SemVer | undefined;
let paramBumpName: string | undefined;
let paramBumpVersion: VersionChangeType | undefined;

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
        if (v === "minor" || v === "patch") {
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
            paramPush = false;
            paramPublishCheck = false;
            continue;
        }

        if (arg === "--test") {
            paramPush = false;
            // still do publish check assuming it is already published even when we don't push
            continue;
        }

        if (arg === "--cleanOnError") {
            paramClean = true;
            continue;
        }

        if (arg === "--commit") {
            paramCommit = true;
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
        console.error(`ERROR: Invalid arguments ${arg}`);
        error = true;
        break;
    }

    if (error) {
        printUsage();
        process.exit(-1);
    }
}

/**
 * Load the repo and either do version bump or dependencies bump
 */
async function main() {
    parseOptions(process.argv);
    const resolvedRoot = await getResolvedFluidRoot();
    console.log(`Repo: ${resolvedRoot}`);
    const gitRepo = new GitRepo(resolvedRoot);
    const context = new Context(gitRepo, await gitRepo.getCurrentBranchName());

    try {
        if (paramBranch) {
            if (paramBumpDepPackages.size) {
                fatal("Conflicting switches --dep and --branch");
            }
            if (paramReleaseName) {
                fatal("Conflicting switches --release and --branch");
            }
            if (paramVersionName) {
                fatal("Conflicting switches --version and --branch");
            }
            if (paramBumpName) {
                fatal("Conflicting switches --bump and --branch");
            }
            await createReleaseBranch(context, "github.com/microsoft/FluidFramework");
        } else if (paramBumpDepPackages.size) {
            if (paramReleaseName) {
                fatal("Conflicting switches --release and --dep");
            }
            if (paramVersionName) {
                fatal("Conflicting switches --version and --dep");
            }
            if (paramBumpName) {
                fatal("Conflicting switches --bump and --dep");
            }
            console.log("Bumping dependencies");

            await bumpDependencies(context, "Bump dependencies version", paramBumpDepPackages, paramPublishCheck, paramCommit);
        } else if (paramReleaseName) {
            if (paramVersionName) {
                fatal("Conflicting switches --release and --version");
            }
            if (paramBumpName) {
                fatal("Conflicting switches --release and --bump");
            }
            await releaseVersion(context, paramReleaseName, paramPublishCheck, paramReleaseVersion);
        } else if (paramVersionName) {
            if (paramBumpName) {
                fatal("Conflicting switches --version and --bump");
            }
            await showVersions(context, paramVersionName, paramVersion);
        } else if (paramBumpName) {
            await bumpVersion(context, [paramBumpName], paramBumpVersion ?? "patch", getPackageShortName(paramBumpName), paramCommit ? "" : undefined);
        } else {
            fatal("Missing command flags --release/--dep/--bump/--version");
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
