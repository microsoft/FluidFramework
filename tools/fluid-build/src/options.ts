/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as os from "os";

interface FastBuildOptions {
    verbose: boolean;
    nolint: boolean;
    lintonly: boolean;
    showExec: boolean;
    timer: boolean;
    logtime: boolean;
    clean: boolean;
    matchedOnly: boolean
    buildScript: string;
    build?: boolean;
    vscode: boolean;
    args: string[];
    root?: string;
    symlink: boolean;
    depcheck: boolean;
    force: boolean;
    install: boolean
    nohoist: boolean;
    uninstall: boolean;
    concurrency: number;
    samples: boolean;
}

// defaults
export const options: FastBuildOptions = {
    verbose: false,
    nolint: false,
    lintonly: false,
    showExec: false,
    logtime: false,
    timer: false,
    clean: false,
    args: [],
    matchedOnly: true,
    root: process.env["_FLUID_ROOT_"],
    buildScript: "build",
    vscode: false,
    symlink: false,
    depcheck: false,
    force: false,
    install: false,
    nohoist: false,
    uninstall: false,
    concurrency: os.cpus().length, // TODO: argument?
    samples: true,

};

function printUsage() {
    console.log(
        `
Usage: fluid-build <options> [<package regexp> ...]
  [<package regexp> ...] Regexp to match the package name (default: all packages)
Options:
  -c --clean          Same as running build script 'clean' on matched packages (all if package regexp is not specified)
  -d --dep            Apply actions (clean/force/rebuild) to matched packages and their dependent packages
  -f --force          Force build and ignore dependency check on matched packages (all if package regexp is not specified)
  -? --help           Print this message
     --logtime        Display the current time on every status message for logging
  -r --rebuild        Clean and build on matched packages (all if package regexp is not specified)
     --root <path>    Root directory of the fluid repo (default: env _FLUID_ROOT_)
  -s --script <name>  NPM script to execute (default:build)
     --timer          Time separate phases
  -v --verbose        Verbose messages
     --vscode         Output error message to work with default problem matcher in vscode
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
    if (nohoist) {
        options.symlink = true;
    }
    setBuild(false);
}

function setUninstall() {
    options.uninstall = true;
    setBuild(false);
}

export function parseOptions(argv: string[]) {
    let error = false;
    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];

        if (arg === "-?" || arg === "--help") {
            printUsage();
            process.exit(0);
        }

        if (arg === "-v" || arg === "--verbose") {
            options.verbose = true;
            continue;
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

        if (arg === "-s" || arg === "--script") {
            if (i !== process.argv.length - 1) {
                options.buildScript = process.argv[++i];
                options.build = true;
                continue;
            }
            console.error("ERROR: Missing argument for --script");
            error = true;
            break;
        }

        if (arg === "--timer") {
            options.timer = true;
            continue;
        }

        if (arg === "--logtime") {
            options.logtime = true;
            continue;
        }

        if (arg === "--root") {
            if (i !== process.argv.length - 1) {
                options.root = process.argv[++i];
                continue;
            }
            console.error("ERROR: Missing argument for --root");
            error = true;
            break;
        }

        if (arg === "--vscode") {
            options.vscode = true;
            continue;
        }

        if (arg === "--symlink") {
            options.symlink = true;
            setBuild(false);
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

        // Package regexp
        if (!arg.startsWith("-")) {
            options.args.push(arg);
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