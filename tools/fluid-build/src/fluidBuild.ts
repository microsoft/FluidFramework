/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Package } from "./npmPackage";
import { parseOptions, options } from "./options";
import { BuildGraph } from "./buildGraph";
import { Timer } from "./common/timer";
import { logStatus } from "./common/logging";
import { existsSync } from "./common/utils";
import * as path from "path";

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
    if (!existsSync(root)) {
        console.log(`ERROR: Repo root '${root}' not exist.`);
        process.exit(-3);
        return;
    }

    const baseDirectory = path.join(root, "packages");
    
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

    // build the graph
    try {
        const buildGraph = new BuildGraph(packages, options.buildScript);
        timer.time("Build graph creation completed");

        if (options.clean) {
            await buildGraph.clean();
            timer.time("Cleaned");
        }

        if (options.build !== false) {
            // Run the build
            const buildStatus = await buildGraph.build(timer);
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

        logStatus(`Total time: ${(timer.getTotalTime()/1000).toFixed(3)}s`);
    } catch (e) {
        logStatus(`ERROR: ${e.message}`);
    }
}

main();


