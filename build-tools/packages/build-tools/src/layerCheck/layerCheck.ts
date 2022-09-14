/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LayerGraph } from "./layerGraph";
import { commonOptions, commonOptionString, parseOption } from "../common/commonOptions";
import { Timer } from "../common/timer";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import { writeFileAsync } from "../common/utils";
import { FluidRepo } from "../common/fluidRepo";
import path from "path";


// This string is duplicated in the readme: update readme if changing this.

function printUsage() {
    console.log(
        `
Usage: fluid-layer-check <options>
Options:
     --dot <path>     Generate *.dot for GraphViz
     --info <path>    Path to the layer graph json file
     --md [<path>]    Generate PACKAGES.md file for human consumption at path relative to repo root (default: repo root)
${commonOptionString}
`);
}

const packagesMdFileName: string = "PACKAGES.md";

let dotGraphFilePath: string | undefined;
let mdFilePath: string | undefined;
let layerInfoPath: string | undefined;

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

        if (arg === "--dot") {
            if (i !== process.argv.length - 1) {
                dotGraphFilePath = process.argv[++i];
                continue;
            }
            console.error("ERROR: Missing argument for --dot");
            error = true;
            break;
        }

        if (arg === "--md") {
            if (i !== process.argv.length - 1) {
                mdFilePath = process.argv[++i];
                continue;
            }
            mdFilePath = "."; // path relative to repo root
            break;
        }

        if (arg === "--info") {
            if (i !== process.argv.length - 1) {
                layerInfoPath = path.resolve(process.argv[++i]);
                continue;
            }
            console.error("ERROR: Missing argument for --info");
            error = true;
            break;
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

/**
 * @deprecated Deprecated in favor of {@link @fluidframework/build-tools/build-cli/src/commands/check/layers.ts }
 */
async function main() {
    const timer = new Timer(commonOptions.timer);

    const resolvedRoot = await getResolvedFluidRoot();

    // Load the package
    const packages = new FluidRepo(resolvedRoot, false).packages;
    timer.time("Package scan completed");

    try {
        const layerGraph = LayerGraph.load(resolvedRoot, packages, layerInfoPath);

        // Write human-readable package list organized by layer
        if (mdFilePath) {
            const packagesMdFilePath: string = path.join(resolvedRoot, mdFilePath, packagesMdFileName);
            await writeFileAsync(packagesMdFilePath, layerGraph.generatePackageLayersMarkdown(resolvedRoot));
        }

        // Write machine-readable dot file used to render a dependency graph
        if (dotGraphFilePath !== undefined) {
            await writeFileAsync(dotGraphFilePath, layerGraph.generateDotGraph());
        }
        const success = layerGraph.verify();
        timer.time("Layer check completed");
        if (!success) {
            process.exit(-1);
        }

        console.log(`Layer check passed (${packages.packages.length} packages)`)
    } catch (e: any) {
        console.error(e.message);
        process.exit(-2);
    }
}

main();
