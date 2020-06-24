/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { LayerGraph } from "./layerGraph";
import { commonOptions, commonOptionString, parseOption } from "../common/commonOptions";
import { Timer } from "../common/timer";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import { writeFileAsync, appendFileAsync } from "../common/utils";
import { FluidRepoBase } from "../common/fluidRepoBase";
import path from "path";

function printUsage() {
    console.log(
        `
Usage: fluid-layer-check <options>
Options:
     --dot <path>     Generate *.dot for GraphViz
${commonOptionString}
`);
}

const packagesMdFileName: string = "PACKAGES.md";

let dotGraphFilePath: string | undefined;

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
    const packages = new FluidRepoBase(resolvedRoot, false).packages;
    timer.time("Package scan completed");

    try {
        const layerGraph = LayerGraph.load(resolvedRoot, packages);

        //* TODO: Include all packages (i.e. the server ones excluded by new FluidRepoBase above)
        //* TODO: Hide behind an option
        // Write human-readable package list organized by layer
        if (true) {
            const packagesMdFilePath: string = path.join(resolvedRoot, "docs", packagesMdFileName);
            await writeFileAsync(packagesMdFilePath, layerGraph.generatePackagesLayerChart());
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
    } catch (e) {
        console.error(e.message);
        process.exit(-2);
    }
}

main();
