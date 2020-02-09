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
    // TODO: Should read lerna.json to determine
    const clientDirectory = path.join(resolvedRoot, "packages");
    const serverDirectory = path.join(resolvedRoot, "server/routerlicious/packages");
    const exampleDirectory = path.join(resolvedRoot, "examples/components");
    const baseDirectories = [
        path.join(resolvedRoot, "common"),
        serverDirectory,
        clientDirectory,
        exampleDirectory,
    ];
    const packageInstallDirectories = [
        path.join(resolvedRoot, "common/build/build-common"),
        path.join(resolvedRoot, "common/build/eslint-config-fluid"),
        path.join(resolvedRoot, "common/lib/common-definitions"),
        path.join(resolvedRoot, "common/lib/common-utils"),
    ];
    const monoReposInstallDirectories = [
        path.join(resolvedRoot),
        serverDirectory,
    ];

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
    } else if (options.all) {
        packages.packages.forEach((pkg) => pkg.setMatched());
    } else if (options.server) {
        packages.packages.forEach((pkg) => {
            if (pkg.directory.startsWith(serverDirectory)) {
                pkg.setMatched();
            }
        });
    } else {
        // Default to client and example packages
        packages.packages.forEach((pkg) => {
            if (pkg.directory.startsWith(clientDirectory) || pkg.directory.startsWith(exampleDirectory)) {
                pkg.setMatched();
            }
        });
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
            const removePromise = Promise.all(
                monoReposInstallDirectories.map(dir => rimrafWithErrorAsync(path.join(dir, "node_modules"), dir))
            );

            const r = await Promise.all([cleanPackageNodeModules, removePromise]);
            const succeeded = r[0] && !r[1].some(ret => ret.error);
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
            console.log("Installing packages");
            if (options.nohoist) {
                if (!await packages.noHoistInstall(resolvedRoot)) {
                    console.error(`ERROR: Install failed`);
                    process.exit(-6);
                }
            } else {
                const installScript = "npm i";
                const installPromises: Promise<ExecAsyncResult>[] = [];
                for (const dir of [...packageInstallDirectories, ...monoReposInstallDirectories]) {
                    installPromises.push(execWithErrorAsync(installScript, { cwd: dir }, dir));
                }
                const rets = await Promise.all(installPromises);

                if (rets.some(ret => ret.error)) {
                    console.error(`ERROR: Install failed`);
                    process.exit(-5);
                }
            }
            timer.time("Install completed", true);
        }

        const symlinkTaskName = options.symlink? "Symlink" : "Symlink check";
        if (!await packages.symlink(options.symlink)) {
            console.error(`ERROR: ${symlinkTaskName} failed`);
            process.exit(-7);
        }
        timer.time(`${symlinkTaskName} completed`, true);

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


