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
import { existsSync, rimrafWithErrorAsync, execWithErrorAsync } from "./common/utils";
import * as path from "path";
import chalk from "chalk";

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

    const resolvedFluidRoot = await getResolvedFluidRoot();
    const resolvedRoot = options.server? path.join(resolvedFluidRoot, "server/routerlicious") : resolvedFluidRoot;

    logStatus(`Processing ${resolvedRoot}`);

    // TODO: Should read lerna.json to determine
    const baseDirectories = [ path.join(resolvedRoot, "packages")];
    if (!options.server) {
        const samplesDirectory = path.join(resolvedRoot, "examples/components");
        if (options.samples && existsSync(samplesDirectory)) {
            baseDirectories.push(samplesDirectory);
        }
    }

    // Load the package
    const packages = Packages.load(baseDirectories);
    timer.time("Package scan completed");

    // Check scripts
    await packages.checkScripts();
    timer.time("Check scripts completed");

    const hasMatchArgs = options.args.length;
    if (hasMatchArgs) {
        let matched = false;
        options.args.forEach((arg) => {
            const regExp = new RegExp(arg);
            packages.packages.forEach((pkg) => {
                if (regExp.test(pkg.name)) {
                    matched = true;
                    pkg.setMatched();
                }
            });
        });

        if (!matched) {
            console.error("ERROR: No package matched");
            process.exit(-4)
        }
    } else {
        packages.packages.forEach((pkg) => pkg.setMatched());
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
            const cleanPackageNodeModules = packages.cleanNodeModules();
            const r = await Promise.all([cleanPackageNodeModules, rimrafWithErrorAsync(path.join(resolvedRoot, "node_modules"), "ERROR")]);
            const succeeded = r[0] && !r[1].error;
            if (!succeeded) {
                console.error(`ERROR: Delete node_module failed`);
                process.exit(-8);
            }
            timer.time("Delete node_modules completed", true);
        }

        if (options.depcheck) {
            for (const pkg of packages.packages) {
                await pkg.depcheck();
            }
            timer.time("Dependencies check completed", true)
        }

        if (options.install) {
            if (options.nohoist) {
                if (!await packages.noHoistInstall(resolvedRoot)) {
                    console.error(`ERROR: Install failed`);
                    process.exit(-6);
                }
            } else {
                const installScript = "npm i";
                const ret = await execWithErrorAsync(installScript, { cwd: resolvedRoot }, "ERROR");
                if (ret.error) {
                    console.error(`ERROR: Install failed`);
                    process.exit(-5);
                }
            }
            timer.time("Install completed", true);
        }

        if (options.symlink) {
            if (!await packages.symlink()) {
                console.error(`ERROR: Symlink failed`);
                process.exit(-7);
            }
            timer.time("Symlink completed", true);
        }

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
                const totalElapsedTime = buildGraph.totalElapsedTime;
                const concurrency = buildGraph.totalElapsedTime / elapsedTime;
                if (commonOptions.timer) {
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


