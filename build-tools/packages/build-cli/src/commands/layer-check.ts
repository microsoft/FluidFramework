/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line unicorn/prefer-node-protocol
import path from "path";
import { Command } from '@oclif/core';
import {
    LayerGraph,
    commonOptions,
    commonOptionString,
    parseOption,
    Timer,
    getResolvedFluidRoot,
    writeFileAsync,
    FluidRepo,
} from "@fluidframework/build-tools";


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

// eslint-disable-next-line @typescript-eslint/no-inferrable-types
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
            try {
                printUsage();
            } catch(error_: unknown) {
                console.error(error_);
            }
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
        try {
            printUsage();
        } catch(error_: unknown) {
            console.error(error_);
        }
    }
}

export class LayerCheck extends Command {
  static description = 'description of this example command';

  async run() {
    const timer = new Timer(commonOptions.timer);

    const resolvedRoot = await getResolvedFluidRoot();

    // Load the package
    const packages = new FluidRepo(resolvedRoot, false).packages;
    timer.time("Package scan completed");

    try {
        const layerGraph = LayerGraph.load(resolvedRoot, packages, layerInfoPath);

        // Write human-readable package list organized by layer
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (mdFilePath) {
            const packagesMdFilePath: string = path.join(resolvedRoot, mdFilePath, packagesMdFileName);
            await writeFileAsync(packagesMdFilePath, layerGraph.generatePackageLayersMarkdown(resolvedRoot));
        }

        // Write machine-readable dot file used to render a dependency graph
        if (dotGraphFilePath !== undefined) {
            await writeFileAsync(dotGraphFilePath, layerGraph.generateDotGraph());
        }

        const success: boolean = layerGraph.verify();
        timer.time("Layer check completed");

        if (!success) {
            throw new Error("Not succesful");
        }

        console.log(`Layer check passed (${packages.packages.length} packages)`)
    } catch (error_: unknown) {
        console.error(error_);
    }
  }
}
