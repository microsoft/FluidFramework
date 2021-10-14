/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import program from "commander";
import { generateTests } from "./testGeneration";
import { getPackageDetails } from "./packageJson";

/**
 * argument parsing
 */
program
    .option("-d|--packageDir <dir>","The root directory of the package")
    .option("-o|--outDir <dir>","The relative path from the root to output the tests")
    .option('-v|--verbose', 'Verbose logging mode')
    .parse(process.argv);

function writeOutLine(output: string) {
    if (program.verbose) {
        console.log(output);
    }
}

writeOutLine("Loading and Refresh existing type data");

const packageData = getPackageDetails(program.packageDir);

writeOutLine("Generating Tests");
generateTests(packageData, program.outDir)
