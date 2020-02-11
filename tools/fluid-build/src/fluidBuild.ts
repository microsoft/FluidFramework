/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Packages } from "./npmPackage";
import { parseOptions, options } from "./options";
import { commonOptions } from "./common/commonOptions";
import { BuildGraph, BuildResult } from "./buildGraph";
import { Timer } from "./common/timer";
import { logStatus } from "./common/logging";
import { getResolvedFluidRoot } from "./common/fluidUtils";
import { existsSync, rimrafWithErrorAsync, execWithErrorAsync, ExecAsyncResult } from "./common/utils";
import * as path from "path";
import chalk from "chalk";
import { FluidRepo } from "./common/fluidRepo";

function versionCheck() {
    const pkg = require(path.join(__dirname, "..", "package.json"));
    const builtVersion = "0.0.4";
    if (pkg.version > builtVersion) {
        console.warn(`WARNING: fluid-build is out of date, please rebuild (built: ${builtVersion}, package: ${pkg.version})\n`);
    }
}

parseOptions(process.argv);

async function main() {
    const timer = new Timer(commonOptions.timer);

    versionCheck();

    const resolvedRoot = await getResolvedFluidRoot();

    logStatus(`Processing ${resolvedRoot}`);

    // Load the package
    // Repo info
    const repo = new FluidRepo(resolvedRoot);
    const packages = repo.packages;
    timer.time("Package scan completed");

    // Check scripts
    await packages.checkScripts();
    timer.time("Check scripts completed");

    const matched = repo.setMatched(options);
    if (!matched) {
        console.error("ERROR: No package matched");
        process.exit(-4)
    }

    if (options.install) {
        const hasRootNodeModules = existsSync(path.join(resolvedRoot, "node_modules"));
        if (hasRootNodeModules === options.nohoist) {
            // We need to uninstall if nohoist doesn't match the current state of installation
            options.uninstall = true;
        }
    }

    try {
        if (options.uninstall) {
            if (!await repo.uninstall()) {
                console.error(`ERROR: uninstall failed`);
                process.exit(-8);
            }
            timer.time("Uninstall completed", true);
        }

        if (options.depcheck) {
            for (const pkg of packages.packages) {
                await pkg.depcheck();
            }
            timer.time("Dependencies check completed", true)
        }

        if (options.install) {
            console.log("Installing packages");
            if (!await repo.install(options.nohoist)) {
                console.error(`ERROR: Install failed`);
                process.exit(-5);
            }
            timer.time("Install completed", true);
        }

        const symlinkTaskName = options.symlink ? "Symlink" : "Symlink check";
        if (!await packages.symlink(options.symlink)) {
            console.error(`ERROR: ${symlinkTaskName} failed`);
            process.exit(-7);
        }
        timer.time(`${symlinkTaskName} completed`, options.symlink);

        if (options.clean || options.build !== false) {
            // build the graph
            const buildGraph = new BuildGraph(packages.packages, options.buildScript);
            timer.time("Build graph creation completed");

            if (options.clean) {
                if (!await buildGraph.clean()) {
                    console.error(`ERROR: Clean failed`);
                    process.exit(-9);
                }
                timer.time("Clean completed");
            }

            if (options.build !== false) {
                // Run the build
                const buildResult = await buildGraph.build(timer);
                const buildStatus = buildResultString(buildResult);
                const elapsedTime = timer.time();
                if (commonOptions.timer) {
                    const totalElapsedTime = buildGraph.totalElapsedTime;
                    const concurrency = buildGraph.totalElapsedTime / elapsedTime;
                    logStatus(`Execution time: ${totalElapsedTime.toFixed(3)}s, Concurrency: ${concurrency.toFixed(3)}`);
                    logStatus(`Build ${buildStatus} - ${elapsedTime.toFixed(3)}s`);
                } else {
                    logStatus(`Build ${buildStatus}`);
                }
            }
        }

        logStatus(`Total time: ${(timer.getTotalTime() / 1000).toFixed(3)}s`);
    } catch (e) {
        logStatus(`ERROR: ${e.message}`);
    }
}

function buildResultString(buildResult: BuildResult) {
    switch (buildResult) {
        case BuildResult.Success:
            return chalk.greenBright("succeeded");
        case BuildResult.Failed:
            return chalk.redBright("failed");
        case BuildResult.UpToDate:
            return chalk.cyanBright("up to date");
    }
}

main();


