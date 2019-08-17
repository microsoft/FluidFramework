/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

interface FastBuildOptions {
    verbose: boolean;
    nolint: boolean;
    lintonly: boolean;
    showExec: boolean;
    timer: boolean;
    logtime: boolean;
    clean: boolean;
    buildScript: string;
    build?: boolean;
    vscode: boolean;
    args: string[];
    root?: string;
    symlink: boolean;
    depcheck: boolean;
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
    root: process.env["_FLUID_ROOT_"],
    buildScript: "build",
    vscode: false,
    symlink: false,
    depcheck: false,
};

function printUsage() {
    console.log(
`
Usage: fluid-build <options> [<npm script>] [<package regexp> ...]
  [<npm script>]         Name of the npm script to run (default: build)
  [<package regexp> ...] Regexp to match the package name (default: all packages)
Options:
  -c --clean             Same as running build script 'clean'
  -? --help              Print this message
     --logtime           Display the current time on every status message for logging
  -r --rebuild           Clean and build
     --root              Root directory of the fluid repo (default: env _FLUID_ROOT_)
  -s --script <name>     NPM script to execute (default:build)
     --timer             Time separate phases
  -v --verbose           Verbose messages
     --vscode            Output error message to work with default problem matcher in vscode
`);
}

export function parseOptions(argv: string[]) {
    let error = false;
    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];

        // Build script or package name
        if (!arg.startsWith("-")) {
            options.args.push(arg);
            continue;
        }

        if (arg === "-?" || arg === "--help") {
            printUsage();
            process.exit(0);
        }

        if (arg === "-v" || arg === "--verbose") {
            options.verbose = true;
            continue;
        }

        if (arg === "-r" || arg === "--rebuild") {
            options.clean = true;
            options.build = true;
            continue;
        }

        if (arg === "-c" || arg === "--clean" || arg === "clean") {
            options.clean = true;
            if (options.build === undefined) {
                options.build = false;
            }
            continue;
        }

        if (arg === "-s" || arg === "--script") {
            if (i !== process.argv.length - 1) {
                options.buildScript = process.argv[++i];
                options.build = true;
                continue;
            }
            console.log("ERROR: Missing argument for --script");
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
            console.log("ERROR: Missing argument for --root");
            error = true;
            break;
        }

        if (arg === "--vscode") {
            options.vscode = true;
            continue;
        }

        if (arg === "--symlink") {
            options.symlink = true;
            continue;
        }

        if (arg === "--depcheck") {
            options.depcheck = true;
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

        console.error(`ERROR: Invalid arguments ${arg}`);
        error = true;
        break;
    }

    if (error) {
        printUsage();
        process.exit(-1);
    }
}