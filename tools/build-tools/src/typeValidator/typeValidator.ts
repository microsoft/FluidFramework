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
    .option("-g|--generateOnly", "This only generates the tests. If does not prepare the package.json")
    .option('-v|--verbose', 'Verbose logging mode')
    .parse(process.argv);

function writeOutLine(output: string) {
    if (program.verbose) {
        console.log(output);
    }
}

async function run(): Promise<boolean>{

    const packageDirs: string[] = [];
    if(program.monoRepoDir){
        writeOutLine(`Finding packages in mono repo ${program.monoRepoDir}`);
        packageDirs.push(... (await findPackagesUnderPath(program.monoRepoDir)));
    }else if(program.packageDir){
        writeOutLine(`${program.packageDir}`);
        packageDirs.push(program.packageDir);
    }else{
        console.log(program.helpInformation());
        return false;
    }

    writeOutLine(`preinstallOnly: ${program.preinstallOnly}`)
    writeOutLine(`generateOnly: ${program.generateOnly}`)

    const concurrency = 25;
    const runningGenerates: Promise<boolean>[]=[];
    // this loop incrementally builds up the runningGenerates promise list
    // each dir with an index greater than concurrency looks back the concurrency value
    // to determine when to run
    packageDirs.forEach(( packageDir,i)=> runningGenerates.push((async ()=> {
        if(i >= concurrency){
            await runningGenerates[i - concurrency];
        }
        const packageName = packageDir.substring(packageDir.lastIndexOf("/") + 1)
        const output = [`${(i+1).toString()}/${packageDirs.length}`,`${packageName}`];
        try{
            const start = Date.now();
            const updateOptions: Parameters<typeof getPackageDetails>[1] =
                program.generateOnly ? undefined : {cwd: program.monoRepoDir};
            const packageData = await getPackageDetails(packageDir, updateOptions)
                .finally(()=>output.push(`Loaded(${Date.now() - start}ms)`));
            if(packageData.skipReason !== undefined){
                output.push(packageData.skipReason)
            }
            else if(packageData.oldVersions.length > 0
                && program.preinstallOnly === undefined){
                const start = Date.now();
                await generateTests(packageData)
                    .then((s)=>output.push(`dirs(${s.dirs}) files(${s.files}) tests(${s.tests})`))
                    .finally(()=> output.push(`Generated(${Date.now() - start}ms)`));
            }
            output.push("Done");
        }catch(error){
            output.push("Error");
            if(typeof error === "string"){
                output.push(error);
            }else if(error instanceof Error){
                output.push(error.message, `\n ${error.stack}`)
            }else{
                output.push(typeof error, `${error}`);
            }
            return false;
        }finally{
            writeOutLine(output.join(": "));
        }
        return true;
    })()));

    return (await Promise.all(runningGenerates)).every((v)=>v);
}

run()
    .then((success)=>process.exit(success ? 0 : 1))
    .catch(()=>process.exit(2));