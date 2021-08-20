/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import program from "commander";
import { refreshVersionedTypeData} from "./typeData";
import { generateTests } from "./testGeneration";

/**
 * argument parsing
 */
program
    .option("-d|--packageDir <dir>","The root directory of the package")
    .option('-q|--quiet', 'Quiet mode')
    .parse(process.argv);

function writeOutLine(output: string) {
    if (!program.quiet) {
        console.log(output);
    }
}

writeOutLine("Loading and Refresh existing type data");
const typeData = refreshVersionedTypeData(program.packageDir);

writeOutLine("Generating Tests");
generateTests(typeData, program.packageDir)
