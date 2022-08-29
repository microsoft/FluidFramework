/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { commonOptions } from "../common/commonOptions";
import { FluidRepoBuild } from "./fluidRepoBuild";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import { defaultLogger } from "../common/logging";
import { Timer } from "../common/timer";
import { existsSync } from "../common/utils";
import { BuildResult } from "./buildGraph";
import { parseOptions, options } from "./options";
import * as path from "path";
import chalk from "chalk";

const {info, error} = defaultLogger;

parseOptions(process.argv);

async function main() {
    const timer = new Timer(commonOptions.timer);
    const resolvedRoot = await getResolvedFluidRoot();

    info(`Fluid Repo Root: ${resolvedRoot}`);

    // Detect nohoist state mismatch and infer uninstall switch
    if (options.install) {
        const hasRootNodeModules = existsSync(path.join(resolvedRoot, "node_modules"));
        if (hasRootNodeModules === options.nohoist) {
            // We need to uninstall if nohoist doesn't match the current state of installation
            options.uninstall = true;
        }
    }

    // Load the package
    const repo = new FluidRepoBuild(resolvedRoot, options.services);
    timer.time("Package scan completed");

    // Set matched package based on options filter
    const matched = repo.setMatched(options);
    if (!matched) {
        error("No package matched");
        process.exit(-4)
    }

    // Dependency checks
    if (options.depcheck) {
        repo.depcheck();
        timer.time("Dependencies check completed", true)
    }

    // Uninstall
    if (options.uninstall) {
        if (!await repo.uninstall()) {
            error(`uninstall failed`);
            process.exit(-8);
        }
        timer.time("Uninstall completed", true);

        if (!options.install) {
            let errorStep: string | undefined = undefined;
            if (options.symlink) {
                errorStep = "symlink";
            } else if (options.clean) {
                errorStep = "clean";
            } else if (options.build) {
                errorStep = "build";
            }
            if (errorStep) {
                console.warn(`WARNING: Skipping ${errorStep} after uninstall`);
            }
            process.exit(0);
        }
    }

    // Install or check install
    if (options.install) {
        console.log("Installing packages");
        if (!await repo.install(options.nohoist)) {
            error(`Install failed`);
            process.exit(-5);
        }
        timer.time("Install completed", true);
    }

    // Symlink check
    const symlinkTaskName = options.symlink ? "Symlink" : "Symlink check";
    await repo.symlink(options);
    timer.time(`${symlinkTaskName} completed`, options.symlink);

    // Check scripts
    await repo.checkPackages(options.fix);
    timer.time("Check scripts completed");

    let failureSummary = "";
    if (options.clean || options.build !== false) {
        info(`Symlink in ${options.fullSymlink ? "full" : options.fullSymlink === false ? "isolated" : "non-dependent"} mode`);

        // build the graph
        const buildGraph = repo.createBuildGraph(options, options.buildScriptNames);
        timer.time("Build graph creation completed");

        // Check install
        if (!await buildGraph.checkInstall()) {
            error("Dependency not installed. Use --install to fix.");
            process.exit(-10);
        }
        timer.time("Check install completed");

        if (options.clean) {
            if (!await buildGraph.clean()) {
                error(`Clean failed`);
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
                info(`Execution time: ${totalElapsedTime.toFixed(3)}s, Concurrency: ${concurrency.toFixed(3)}`);
                info(`Build ${buildStatus} - ${elapsedTime.toFixed(3)}s`);
            } else {
                info(`Build ${buildStatus}`);
            }
            failureSummary = buildGraph.taskFailureSummary;
        }
    }

    if (options.build === false) {
        info(`Other switches with no explicit build script, not building.`);
    }

    info(`Total time: ${(timer.getTotalTime() / 1000).toFixed(3)}s`);

    if (failureSummary !== "") {
        info(`\n${failureSummary}`);
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

main().catch(error => {
    info(`ERROR: Unexpected error. ${error.message}`);
    info(error.stack);
});
