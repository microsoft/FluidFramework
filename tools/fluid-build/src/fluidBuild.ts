/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Package } from "./npmPackage";
import { parseOptions, options } from "./options";
import { BuildGraph, BuildResult } from "./buildGraph";
import { Timer } from "./common/timer";
import { logStatus } from "./common/logging";
import { existsSync } from "./common/utils";
import * as path from "path";
import chalk from "chalk";

parseOptions(process.argv);

function versionCheck() {
    const pkg = require(path.join(__dirname, "..", "package.json"));
    const builtVersion = "0.0.1";
    if (pkg.version > builtVersion) {
        console.log(`WARNING: fluid-build is out of date, please rebuild (built: ${builtVersion}, package: ${pkg.version})\n`);
    }
}

async function main() {
    const timer = new Timer(options.timer);

    versionCheck();

    const root = options.root;
    if (!root) {
        console.log(`ERROR: Unknown repo root. Specify it with --root or environment variable _FLUID_ROOT_`);
        process.exit(-2);
        return;
    }
    const resolvedRoot = path.resolve(root);
    if (!existsSync(resolvedRoot)) {
        console.log(`ERROR: Repo root '${resolvedRoot}' not exist.`);
        process.exit(-3);
        return;
    }

    const baseDirectory = path.join(resolvedRoot, "packages");

    // Load the package
    const packages = Package.load(baseDirectory);
    timer.time("Package scan completed");

    if (options.args.length) {
        let matched = false;
        options.args.forEach((arg) => {
            const regExp = new RegExp(arg);
            packages.forEach((pkg) => {
                if (regExp.test(pkg.name)) {
                    matched = true;
                    pkg.markForBuild = true;
                }
            });
        });

        if (!matched) {
            console.log("ERROR: No package matched");
            process.exit(-4)
        }
    } else {
        packages.forEach((pkg) => pkg.markForBuild = true);
    }

    if (options.depcheck) {
        for (const pkg of packages) {
            await pkg.depcheck();
        }
        timer.time("Dependencies check completed")
    }

    // build the graph
    try {
        const buildGraph = new BuildGraph(packages, options.buildScript);
        timer.time("Build graph creation completed");

        if (options.clean) {
            await buildGraph.clean();
            timer.time("Clean completed");
        }

        if (options.symlink) {
            await buildGraph.symlink();
            timer.time("Symlink completed");
        }

        if (options.build !== false) {
            // Run the build
            const buildResult = await buildGraph.build(timer);
            const buildStatus = buildResultString(buildResult);
            const elapsedTime = timer.time();
            const totalElapsedTime = buildGraph.totalElapsedTime;
            const concurrency = buildGraph.totalElapsedTime / elapsedTime;
            if (options.timer) {
                logStatus(`Execution time: ${totalElapsedTime.toFixed(3)}s, Concurrency: ${concurrency.toFixed(3)}`);
                logStatus(`Build ${buildStatus} - ${elapsedTime.toFixed(3)}s`);
            } else {
                logStatus(`Build ${buildStatus}`);
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


