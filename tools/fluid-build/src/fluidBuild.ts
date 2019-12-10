/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Packages } from "./npmPackage";
import { parseOptions, options } from "./options";
import { BuildGraph, BuildResult } from "./buildGraph";
import { LayerGraph } from "./layerGraph";
import { Timer } from "./common/timer";
import { logStatus } from "./common/logging";
import { existsSync, readFileAsync, rimrafWithErrorAsync, execWithErrorAsync } from "./common/utils";
import * as path from "path";
import chalk from "chalk";

parseOptions(process.argv);

async function isFluidRootLerna(dir: string) {
    const filename = path.join(dir, "lerna.json");
    if (!existsSync(filename)) {
        return false;
    }

    const content = await readFileAsync(filename, "utf-8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed.packages) && parsed.packages.length == 1 && parsed.packages[0] === "packages/**") {
        return true;
    }
    return false;
}

async function isFluidRootPackage(dir: string) {
    const filename = path.join(dir, "package.json");
    if (!existsSync(filename)) {
        return false;
    }

    const content = await readFileAsync(filename, "utf-8");
    const parsed = JSON.parse(content);
    if (parsed.name === "root" && parsed.private === true) {
        return true;
    }
    return false;
}

async function inferRoot() {
    let curr = process.cwd();
    while (true) {
        try {
            if (await isFluidRootLerna(curr) && await isFluidRootPackage(curr)) {
                console.log(`Build fluid repo @ ${curr}`)
                return curr;
            }
        } catch {
        }

        const up = path.resolve(curr, "..");
        if (up === curr) {
            break;
        }
        curr = up;
    }
    return undefined;
}

function versionCheck() {
    const pkg = require(path.join(__dirname, "..", "package.json"));
    const builtVersion = "0.0.2";
    if (pkg.version > builtVersion) {
        console.warn(`WARNING: fluid-build is out of date, please rebuild (built: ${builtVersion}, package: ${pkg.version})\n`);
    }
}

async function main() {
    const timer = new Timer(options.timer);

    versionCheck();

    if (!options.root) {
        options.root = await inferRoot();
    }

    const root = options.root;
    if (!root) {
        console.error(`ERROR: Unknown repo root. Specify it with --root or environment variable _FLUID_ROOT_`);
        process.exit(-2);
        return;
    }
    const resolvedRoot = path.resolve(root);
    if (!existsSync(resolvedRoot)) {
        console.error(`ERROR: Repo root '${resolvedRoot}' not exist.`);
        process.exit(-3);
        return;
    }

    // TODO: Should read lerna.json to determine
    const baseDirectories = [ path.join(resolvedRoot, "packages")];
    const samplesDirectory = path.join(resolvedRoot, "samples/chaincode");
    if (options.samples && existsSync(samplesDirectory)) {
        baseDirectories.push(samplesDirectory);
    }

    // Load the package
    const packages = Packages.load(baseDirectories);
    timer.time("Package scan completed");

    if (options.layerCheck) {
        LayerGraph.check(resolvedRoot, packages);
        timer.time("Layer check completed");
    }
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
            timer.time("Delete node_modules completed");
        }

        if (options.depcheck) {
            for (const pkg of packages.packages) {
                await pkg.depcheck();
            }
            timer.time("Dependencies check completed")
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
            timer.time("Install completed");
        }

        if (options.symlink) {
            if (!await packages.symlink()) {
                console.error(`ERROR: Symlink failed`);
                process.exit(-7);
            }
            timer.time("Symlink completed");
        }

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


