/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import * as os from "os";
import { commonOptionString, parseOption } from "../common/commonOptions"
import { existsSync } from "../common/utils";
import { IPackageMatchedOptions } from "./fluidRepoBuild";
import { ISymlinkOptions } from "./symlinkUtils";

interface FastBuildOptions extends IPackageMatchedOptions, ISymlinkOptions {
    nolint: boolean;
    lintonly: boolean;
    showExec: boolean;
    clean: boolean;
    matchedOnly: boolean
    buildScriptNames: string[];
    build?: boolean;
    vscode: boolean;
    symlink: boolean;
    fullSymlink: boolean | undefined;
    depcheck: boolean;
    force: boolean;
    install: boolean
    nohoist: boolean;
    uninstall: boolean;
    concurrency: number;
    samples: boolean;
    fix: boolean;
    services: boolean;
    worker: boolean;
    workerThreads: boolean;
    workerMemoryLimit: number;
}

// defaults
export const options: FastBuildOptions = {
    nolint: false,
    lintonly: false,
    showExec: false,
    clean: false,
    match: [],
    dirs: [],
    matchedOnly: true,
    buildScriptNames: [],
    vscode: false,
    symlink: false,
    fullSymlink: undefined,
    depcheck: false,
    force: false,
    install: false,
    nohoist: false,
    uninstall: false,
    concurrency: os.cpus().length, // TODO: argument?
    samples: true,
    fix: false,
    all: false,
    server: false,
    azure: false,
    services: false,
    worker: false,
    workerThreads: false,
    workerMemoryLimit: -1,
};

// This string is duplicated in the readme: update readme if changing this.

function printUsage() {
    console.log(
        `
Usage: fluid-build <options> [(<package regexp>|<path>) ...]
    [<package regexp> ...] Regexp to match the package name (default: all packages)
Options:
       --all            Operate on all packages/monorepo (default: client monorepo). See also "--server".
    -c --clean          Same as running build script 'clean' on matched packages (all if package regexp is not specified)
    -d --dep            Apply actions (clean/force/rebuild) to matched packages and their dependent packages
       --fix            Auto fix warning from package check if possible
    -f --force          Force build and ignore dependency check on matched packages (all if package regexp is not specified)
    -? --help           Print this message
       --install        Run npm install for all packages/monorepo. This skips a package if node_modules already exists: it can not be used to update in response to changes to the package.json.
    -r --rebuild        Clean and build on matched packages (all if package regexp is not specified)
       --reinstall      Same as --uninstall --install.
       --root <path>    Root directory of the Fluid repo (default: env _FLUID_ROOT_)
    -s --script <name>  npm script to execute (default:build)
       --azure          Operate on the azure monorepo (default: client monorepo). Overridden by "--all"
       --server         Operate on the server monorepo (default: client monorepo). Overridden by "--all"
       --symlink        Fix symlink between packages within monorepo (isolate mode). This configures the symlinks to only connect within each lerna managed group of packages. This is the configuration tested by CI and should be kept working.
       --symlink:full   Fix symlink between packages across monorepo (full mode). This symlinks everything in the repo together. CI does not ensure this configuration is functional, so it may or may not work.
       --uninstall      Clean all node_modules. This errors if some node-nodules folders do not exists: if hitting this limitation you can do an install first to work around it.
       --vscode         Output error message to work with default problem matcher in vscode
${commonOptionString}
`);
}

function setClean(build: boolean) {
    options.force = true;
    options.clean = true;
    setBuild(build);
}

function setBuild(build: boolean) {
    if (build || options.build === undefined) {
        options.build = build;
    }
}

function setReinstall(nohoist: boolean) {
    options.uninstall = true;
    setInstall(nohoist);
}

function setInstall(nohoist: boolean) {
    options.install = true;
    options.nohoist = nohoist;
    setBuild(false);
}

function setUninstall() {
    options.uninstall = true;
    setBuild(false);
}

function setSymlink(fullSymlink: boolean) {
    options.symlink = true;
    options.fullSymlink = fullSymlink;
    setBuild(false);
}

export function parseOptions(argv: string[]) {
    let error = false;
    for (let i = 2; i < argv.length; i++) {
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
            options.matchedOnly = false;
            continue;
        }

        if (arg === "-r" || arg === "--rebuild") {
            setClean(true);
            continue;
        }

        if (arg === "-c" || arg === "--clean") {
            setClean(false);
            continue;
        }

        if (arg === "-f" || arg === "--force") {
            options.force = true;
            continue;
        }

        if (arg === "--nosamples") {
            options.samples = false;
            continue;
        }

        if (arg === "--fix") {
            options.fix = true;
            setBuild(false);
            continue;
        }

        if (arg === "--install") {
            setInstall(false);
            continue;
        }

        if (arg === "--install:nohoist") {
            setInstall(true);
            continue;
        }

        if (arg === "--reinstall") {
            setReinstall(false);
            continue;
        }

        if (arg === "--reinstall:nohoist") {
            setReinstall(true);
            continue;
        }

        if (arg === "--uninstall") {
            setUninstall();
            continue;
        }

        if (arg === "--services") {
            options.services = true;
            continue;
        }

        if (arg === "--all") {
            options.all = true;
            continue;
        }

        if (arg === "--azure") {
            options.azure = true;
            continue;
        }

        if (arg === "--server") {
            options.server = true;
            continue;
        }

        if (arg === "-s" || arg === "--script") {
            if (i !== process.argv.length - 1) {
                options.buildScriptNames.push(process.argv[++i]);
                setBuild(true);
                continue;
            }
            console.error("ERROR: Missing argument for --script");
            error = true;
            break;
        }

        if (arg === "--vscode") {
            options.vscode = true;
            continue;
        }

        if (arg === "--symlink") {
            setSymlink(false);
            continue;
        }

        if (arg === "--symlink:full") {
            setSymlink(true);
            continue;
        }

        if (arg === "--depcheck") {
            options.depcheck = true;
            setBuild(false);
            continue;
        }

        // These options are not public
        if (arg === "--nolint") {
            options.nolint = true;
            continue;
        }

        if (arg === "--lintonly") {
            options.lintonly = true;
            continue;
        }

        if (arg === "--showExec") {
            options.showExec = true;
            continue;
        }

        if (arg === "--worker") {
            options.worker = true;
            continue;
        }

        if (arg === "--workerThreads") {
            options.workerThreads = true;
            options.worker = true;
            continue;
        }

        if (arg === "--workerMemoryLimitMB") {
            if (i !== process.argv.length - 1) {
                const mb = parseInt(process.argv[++i]);
                if (!isNaN(mb)) {
                    options.workerMemoryLimit = mb * 1024 * 1024;
                    continue;
                }
                console.error("ERROR: Argument for --workerMemoryLimitMB is not a number");
            } else {
                console.error("ERROR: Missing argument for --workerMemoryLimit");
            }
            error = true;
            break;
        }

        // Package regexp or paths
        if (!arg.startsWith("-")) {
            const resolvedPath = path.resolve(arg);
            if (existsSync(resolvedPath)) {
                options.dirs.push(arg);
            } else {
                options.match.push(arg);
            }
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

    if (options.buildScriptNames.length === 0) {
        options.buildScriptNames = ["build"];
    }
}
