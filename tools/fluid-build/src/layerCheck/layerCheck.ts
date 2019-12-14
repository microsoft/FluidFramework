/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Packages } from "../npmPackage";
import { LayerGraph } from "./layerGraph";
import { commonOptions, commonOptionString, parseOption } from "../common/commonOptions";
import { Timer } from "../common/timer";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import * as path from "path";

function printUsage() {
    console.log(
        `
Usage: fluid-layer-check <options>
Options:
${commonOptionString}
`);
}

function parseOptions(argv: string[]) {
    let error = false;
    for (let i = 2; i < process.argv.length; i++) {
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

        console.error(`ERROR: Invalid arguments ${arg}`);
        error = true;
        break;
    }

    if (error) {
        printUsage();
        process.exit(-1);
    }
}

function versionCheck() {
    const pkg = require(path.join(__dirname, "..", "..", "package.json"));
    const builtVersion = "0.0.3";
    if (pkg.version > builtVersion) {
        console.warn(`WARNING: fluid-build is out of date, please rebuild (built: ${builtVersion}, package: ${pkg.version})\n`);
    }
}

parseOptions(process.argv);

async function main() {
    const timer = new Timer(commonOptions.timer);

    versionCheck();

    const resolvedRoot = await getResolvedFluidRoot();

    const baseDirectories = [
        path.join(resolvedRoot, "packages"),
        path.join(resolvedRoot, "samples/chaincode"),
        path.join(resolvedRoot, "server/routerlicious/packages")
    ];

    // Load the package
    const packages = Packages.load(baseDirectories);
    timer.time("Package scan completed");

    
    const layerGraph = LayerGraph.load(resolvedRoot, packages);
    console.log(layerGraph.generateDotGraph());
    const success = layerGraph.verify();
    timer.time("Layer check completed");
    if (!success) {
        process.exit(-1);
    }
}

main();
