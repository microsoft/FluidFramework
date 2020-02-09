/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as os from "os";
import { commonOptionString, parseOption } from "./common/commonOptions"

interface FastBuildOptions {
    nolint: boolean;
    lintonly: boolean;
    showExec: boolean;
    clean: boolean;
    matchedOnly: boolean
    buildScript: string;
    build?: boolean;
    vscode: boolean;
    args: string[];
    symlink: boolean;
    depcheck: boolean;
    force: boolean;
    install: boolean
    nohoist: boolean;
    uninstall: boolean;
    concurrency: number;
    samples: boolean;
    fixScripts: boolean;
    all: boolean;
    server: boolean;
}

// defaults
export const options: FastBuildOptions = {
    nolint: false,
    lintonly: false,
    showExec: false,
    clean: false,
    args: [],
    matchedOnly: true,
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
    fixScripts: false,
    all: false,
    server: false,
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
  -r --rebuild        Clean and build on matched packages (all if package regexp is not specified)
     --root <path>    Root directory of the fluid repo (default: env _FLUID_ROOT_)
  -s --script <name>  NPM script to execute (default:build)
     --server         Operate on the server monorepo
     --timer          Time separate phases
  -v --verbose        Verbose messages
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

        if (arg === "--fixscripts") {
            options.fixScripts = true;
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

        if (arg === "--all") {
            options.all = true;
            continue;
        }

        if (arg === "--server") {
            options.server = true;
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