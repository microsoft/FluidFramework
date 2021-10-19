/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import program from "commander";
import { getPackageDetails } from "./packageJson";
import { BreakingIncrement, validatePackage } from "./packageValidator";

function writeOutLine(output: string) {
    if (program.verbose) {
        console.log(output);
    }
}

function runOnPackage(packageDir: string) {
    const packageData = getPackageDetails(packageDir);
    const [increment, types] = validatePackage(packageData, packageDir, new Map());
    console.log(`major:${increment & BreakingIncrement.major} minor:${increment & BreakingIncrement.minor}`);
    console.log(types.keys());
}

/**
 * argument parsing
 */
program
    .option("-d|--packageDir <dir>","The root directory of the package")
    .option('-v|--verbose', 'Verbose logging mode')
    .parse(process.argv);

// const needsMinor = needsMinorIncrement(program.packageDir, false);
runOnPackage(program.packageDir);
