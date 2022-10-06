/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @deprecated Use the `flub generate packageJson` command in the @fluid-tools/build-cli package.
 */
import { commonOptionString, commonOptions, parseOption } from "../common/commonOptions";
import { FluidRepo } from "../common/fluidRepo";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import { MonoRepoKind } from "../common/monoRepo";
import { Timer } from "../common/timer";
import { generateMonoRepoInstallPackageJson } from "./lib";

function printUsage() {
    console.log(
        `
Usage: fluid-gen-pkg-lock <options>
Options:
${commonOptionString}
     --server         Generate package lock for server mono repo (default: client)
     --azure          Generate package lock for azure mono repo (default: client)
     --build-tools    Generate package lock for build-tools mono repo (default: client)
`,
    );
}

let kind = MonoRepoKind.Client;

function parseOptions(argv: string[]) {
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

        const arg = argv[i];

        if (arg === "-?" || arg === "--help") {
            printUsage();
            process.exit(0);
        }

        if (arg === "--server") {
            kind = MonoRepoKind.Server;
            continue;
        }

        if (arg === "--azure") {
            kind = MonoRepoKind.Azure;
            continue;
        }

        if (arg === "--build-tools") {
            kind = MonoRepoKind.BuildTools;
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

parseOptions(process.argv);

async function main() {
    const timer = new Timer(commonOptions.timer);

    const resolvedRoot = await getResolvedFluidRoot();

    // Load the package
    const repo = new FluidRepo(resolvedRoot, false);
    timer.time("Package scan completed");

    const releaseGroup = repo.monoRepos.get(kind);
    if (releaseGroup === undefined) {
        throw new Error(`release group couldn't be found.`);
    }

    await generateMonoRepoInstallPackageJson(releaseGroup);
}

main().catch((error) => {
    console.error("ERROR: Unexpected error");
    console.error(error.stack);
});
