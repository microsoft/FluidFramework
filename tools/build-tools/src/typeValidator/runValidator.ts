/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import program from "commander";
import { getPackageDetails } from "./packageJson";
import { BreakingIncrement, validatePackage } from "./packageValidator";

function runOnPackage(packageDir: string) {
    const packageData = getPackageDetails(packageDir);
    const [increment, types] = validatePackage(packageData, packageDir, new Map());
    console.log(`major:${increment & BreakingIncrement.major ? "yes" : "no"}`);
    console.log(`minor:${increment & BreakingIncrement.minor ? "yes" : "no"}`);
    console.log(types.keys());
}

/**
 * argument parsing
 */
program
    .option("-d|--packageDir <dir>","The root directory of the package")
    .option('-v|--verbose', 'Verbose logging mode')
    .parse(process.argv);

runOnPackage(program.packageDir);
