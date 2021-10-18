/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import program from "commander";
import { generateTests } from "./testGeneration";
import { findPackagesUnderPath, getPackageDetails } from "./packageJson";

/**
 * argument parsing
 */
program
    .option("-d|--packageDir <dir>","The root directory of the package")
    .option("-m|--monoRepoDir <dir>","The root directory of the mono repo, under which there are packages.")
    .option("-p|--preinstallOnly", "Only prepares the package json. Doesn't generate tests. This should be done before npm install")
    .option('-v|--verbose', 'Verbose logging mode')
    .parse(process.argv);

function writeOutLine(output: string) {
    if (program.verbose) {
        console.log(output);
    }
}

const packageDirs: string[] = [];
if(program.monoRepoDir){
    writeOutLine(`Finding packages in mono repo ${program.monoRepoDir}`);
    packageDirs.push(...findPackagesUnderPath(program.monoRepoDir));
    packageDirs.forEach((d)=>writeOutLine(d));
}else{
    packageDirs.push(program.packageDir);
}

packageDirs.forEach((packageDir)=>{

    writeOutLine(`Loading and Refresh existing type data for ${packageDir}`);
    const packageData = getPackageDetails(packageDir);

    if(program.preinstallOnly === undefined){
        writeOutLine("Generating Tests");
        generateTests(packageData);
    }
});
