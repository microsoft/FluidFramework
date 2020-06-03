/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidRepoBase } from "../common/fluidRepoBase";
import { MonoRepo, MonoRepoKind } from "../common/monoRepo";
import { Timer } from "../common/timer";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import { commonOptions, commonOptionString, parseOption } from "../common/commonOptions";
import { readJsonSync, writeFileAsync } from "../common/utils";
import { Package } from "../common/npmPackage";
import path from "path";

function printUsage() {
    console.log(
        `
Usage: fluid-gen-pkg-lock <options>
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

parseOptions(process.argv);


async function generateMonoRepoInstallPackageJson(monoRepo: MonoRepo) {
    const packageMap = new Map<string, Package>(monoRepo.packages.map(pkg => [pkg.name, pkg]));
    const repoPackageJson: any = {};
    repoPackageJson.name = `@fluid-internal/${MonoRepoKind[monoRepo.kind].toLowerCase()}`;
    repoPackageJson.version = monoRepo.version;
    repoPackageJson.dependencies = {};
    repoPackageJson.devDependencies = {};
    monoRepo.packages.forEach((pkg) => {
        for (const dep in pkg.packageJson.dependencies) {
            if (packageMap.has(dep)) { continue; }
            const version = pkg.packageJson.dependencies[dep];
            const existing = repoPackageJson.dependencies[dep];
            if (existing) {
                if (existing !== version) {
                    throw new Error(`Dependency version mismatch for ${dep}: ${existing} and ${version}`);
                }
                continue;
            }
            repoPackageJson.dependencies[dep] = pkg.packageJson.dependencies[dep];
        }
    });
    monoRepo.packages.forEach((pkg) => {
        for (const dep in pkg.packageJson.devDependencies) {
            if (packageMap.has(dep)) { continue; }
            const version = pkg.packageJson.devDependencies[dep];
            const existing = repoPackageJson.dependencies[dep]?? repoPackageJson.devDependencies[dep];
            if (existing) {
                if (existing !== version) {
                    throw new Error(`Dependency version mismatch for ${dep}: ${existing} and ${version}`);
                }
                continue;
            }
            repoPackageJson.devDependencies[dep] = pkg.packageJson.devDependencies[dep];
        }
    });

    await writeFileAsync(path.join(monoRepo.repoPath, "repo-package.json"), JSON.stringify(repoPackageJson, undefined, 2));
}

async function main() {
    const timer = new Timer(commonOptions.timer);

    const resolvedRoot = await getResolvedFluidRoot();

    // Load the package
    const repo = new FluidRepoBase(resolvedRoot, false);
    timer.time("Package scan completed");

    return Promise.all([
        generateMonoRepoInstallPackageJson(repo.clientMonoRepo),
        generateMonoRepoInstallPackageJson(repo.serverMonoRepo)
    ]);
};

main().catch(error => {
    console.error("ERROR: Unexpected error");
    console.error(error.stack);
});
