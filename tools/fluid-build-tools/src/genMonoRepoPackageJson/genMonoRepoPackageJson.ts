/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidRepoBase } from "../common/fluidRepoBase";
import { MonoRepo, MonoRepoKind } from "../common/monoRepo";
import { Timer } from "../common/timer";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import { commonOptions, commonOptionString, parseOption } from "../common/commonOptions";
import { writeFileAsync, readJsonAsync } from "../common/utils";
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

function format(n: number) {
    return n.toString().padStart(4);
}

async function generateMonoRepoPackageLockJson(monoRepo: MonoRepo, repoPackageJson: any) {
    // Patching the package-lock file
    const repoPackageLockJson = await readJsonAsync(path.join(monoRepo.repoPath, "lerna-package-lock.json"));

    let totalDevCount = 0;
    let topLevelDevCount = 0;
    const setDev = (item: any, dev: boolean) => {
        if (dev) {
            totalDevCount++;
            item.dev = dev;
        } else {
            totalDevCount--;
            delete item.dev;
        }
        if (!item.dependencies) { return; }
        for (const dep in item.dependencies) {
            setDev(item.dependencies[dep], dev);
        }
    }
    for (const dep in repoPackageLockJson.dependencies) {
        topLevelDevCount++;
        setDev(repoPackageLockJson.dependencies[dep], true);
    }

    const totalCount = totalDevCount;
    const topLevelTotalCount = topLevelDevCount;

    const markNonDev = (dep: string) => {
        const item = repoPackageLockJson.dependencies[dep];
        if (!item) {
            throw new Error(`Missing ${dep} in lock file`);
        }
        if (item.dev) {
            topLevelDevCount--;
            setDev(item, false);
            for (const req in item.requires) {
                markNonDev(req);
            }
        }
    }

    for (const dep in repoPackageJson.dependencies) {
        markNonDev(dep);
    }

    console.log(`${MonoRepoKind[monoRepo.kind]}: ${format(totalDevCount)}/${format(totalCount)} locked devDependencies`);
    console.log(`${MonoRepoKind[monoRepo.kind]}: ${format(topLevelDevCount)}/${format(topLevelTotalCount)} top level locked devDependencies`);
    return writeFileAsync(path.join(monoRepo.repoPath, "repo-package-lock.json"), JSON.stringify(repoPackageLockJson, undefined, 2));
}

interface PackageJson {
    name: string;
    version: string;
    dependencies: { [key: string]: string };
    devDependencies: { [key: string]: string };
}

function processDependencies(repoPackageJson: PackageJson, packageJson: PackageJson, packageMap: Map<string, Package>) {
    let depCount = 0;
    for (const dep in packageJson.dependencies) {
        if (packageMap.has(dep)) { continue; }
        const version = packageJson.dependencies[dep];
        const existing = repoPackageJson.dependencies[dep];
        if (existing) {
            if (existing !== version) {
                throw new Error(`Dependency version mismatch for ${dep}: ${existing} and ${version}`);
            }
            continue;
        }
        repoPackageJson.dependencies[dep] = version;
        depCount++;
    }
    return depCount++;
}

function processDevDependencies(repoPackageJson: PackageJson, packageJson: PackageJson, packageMap: Map<string, Package>) {
    let devDepCount = 0;
    for (const dep in packageJson.devDependencies) {
        if (packageMap.has(dep)) { continue; }
        const version = packageJson.devDependencies[dep];
        const existing = repoPackageJson.dependencies[dep] ?? repoPackageJson.devDependencies[dep];
        if (existing) {
            if (existing !== version) {
                throw new Error(`Dependency version mismatch for ${dep}: ${existing} and ${version}`);
            }
            continue;
        }
        repoPackageJson.devDependencies[dep] = packageJson.devDependencies[dep];
        devDepCount++;
    }
    return devDepCount++;
}

async function generateMonoRepoInstallPackageJson(monoRepo: MonoRepo) {
    const packageMap = new Map<string, Package>(monoRepo.packages.map(pkg => [pkg.name, pkg]));
    const repoPackageJson: PackageJson = {
        name: `@fluid-internal/${MonoRepoKind[monoRepo.kind].toLowerCase()}`,
        version: monoRepo.version,
        dependencies: {},
        devDependencies: {},
    };

    const rootPackageJson = await readJsonAsync(path.join(monoRepo.repoPath, "package.json"));

    let depCount = 0;
    let devDepCount = 0;
    monoRepo.packages.forEach((pkg) => {
        depCount += processDependencies(repoPackageJson, pkg.packageJson, packageMap);
    });
    processDependencies(repoPackageJson, rootPackageJson, packageMap);

    monoRepo.packages.forEach((pkg) => {
        devDepCount += processDevDependencies(repoPackageJson, pkg.packageJson, packageMap);
    });
    processDevDependencies(repoPackageJson, rootPackageJson, packageMap);

    await writeFileAsync(path.join(monoRepo.repoPath, "repo-package.json"), JSON.stringify(repoPackageJson, undefined, 2));
    console.log(`${MonoRepoKind[monoRepo.kind]}: ${format(devDepCount)}/${format(depCount + devDepCount)} devDependencies`);
    return generateMonoRepoPackageLockJson(monoRepo, repoPackageJson);
}

async function main() {
    const timer = new Timer(commonOptions.timer);

    const resolvedRoot = await getResolvedFluidRoot();

    // Load the package
    const repo = new FluidRepoBase(resolvedRoot, false);
    timer.time("Package scan completed");

    await generateMonoRepoInstallPackageJson(repo.clientMonoRepo);
    await generateMonoRepoInstallPackageJson(repo.serverMonoRepo);
};

main().catch(error => {
    console.error("ERROR: Unexpected error");
    console.error(error.stack);
});
