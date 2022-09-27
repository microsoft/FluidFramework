/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @deprecated In favor `build-tools/packages/build-cli/src/genMonoRepoPackageJson.ts`.
 */

import { FluidRepo } from "../common/fluidRepo";
import { MonoRepo, MonoRepoKind } from "../common/monoRepo";
import { Timer } from "../common/timer";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import { commonOptions, commonOptionString, parseOption } from "../common/commonOptions";
import { readJsonAsync, writeFileAsync } from "../common/utils";
import { Package } from "../common/npmPackage";
import path from "path";

function printUsage() {
    console.log(
        `
Usage: fluid-gen-pkg-lock <options>
Options:
${commonOptionString}
     --server         Generate package lock for server mono repo (default: client)
     --azure          Generate package lock for azure mono repo (default: client)
     --build-tools    Generate package lock for build-tools mono repo (default: client)
`);
}

let kind = MonoRepoKind.Client;

function parseOptions(argv: string[]) {
    let error = false;
    for (let i = 2; i < argv.length; i++) {
        const argParsed = parseOption(argv, i);
        if (argParsed < 0) {
            error = true;
            break;
        }
        if (argParsed > 0) {
            i += argParsed - 1;
            continue;
        }

        const arg = argv[i];

        if (arg === "-?" || arg === "--help") {
            printUsage();
            process.exit(0);
        }

        if (arg === "--server") {
            kind = MonoRepoKind.Server;
            continue;
        }

        if (arg === "--azure") {
            kind = MonoRepoKind.Azure;
            continue;
        }

        if (arg === "--build-tools") {
            kind = MonoRepoKind.BuildTools;
            continue;
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

    const setDev = (item: any) => {
        totalDevCount++;
        item.dev = true;
        if (!item.dependencies) { return; }
        for (const dep in item.dependencies) {
            setDev(item.dependencies[dep]);
        }
    }

    // Assume all of them are dev dependencies
    for (const dep in repoPackageLockJson.dependencies) {
        topLevelDevCount++;
        setDev(repoPackageLockJson.dependencies[dep]);
    }
    const totalCount = totalDevCount;
    const topLevelTotalCount = topLevelDevCount;

    const markNonDev = (name: string, topRef: string, item: any, refStack: any[]) => {
        totalDevCount--;
        delete item.dev;
        refStack.push(item);
        if (item.dependencies) {
            // mark unhoisted dependencies recursively
            for (const dep in item.dependencies) {
                markNonDev(dep, topRef, item.dependencies[dep], refStack);
            }
        }
        // Mark the hoisted dependencies
        for (const req in item.requires) {
            if (!refStack.some(scope => scope.dependencies && scope.dependencies[req] !== undefined)) {
                markTopLevelNonDev(req, name, topRef);
            }
        }
        refStack.pop();
    }

    const markTopLevelNonDev = (dep: string, ref: string, topRef: string) => {
        const item = repoPackageLockJson.dependencies[dep];
        if (!item) {
            throw new Error(`Missing ${dep} in lock file referenced by ${ref} from ${topRef} in ${monoRepo.kind.toLowerCase()}`);
        }
        if (commonOptions.verbose) {
            console.log(`NonDev Ref: ${topRef}..${ref} => ${dep}`);
        }

        if (item.dev) {
            topLevelDevCount--;
            markNonDev(dep, dep, item, []);
        }
    }

    // Go thru the non-dev dependencies in the package.json file and recursively mark the dependency tree as non-dev
    for (const dep in repoPackageJson.dependencies) {
        markTopLevelNonDev(dep, "<root>", "<root>");
    }

    console.log(`${monoRepo.kind}: ${format(totalDevCount)}/${format(totalCount)} locked devDependencies`);
    console.log(`${monoRepo.kind}: ${format(topLevelDevCount)}/${format(topLevelTotalCount)} top level locked devDependencies`);
    return writeFileAsync(path.join(monoRepo.repoPath, "repo-package-lock.json"), JSON.stringify(repoPackageLockJson, undefined, 2));
}

interface PackageJson {
    name: string;
    version: string;
    private?: boolean;
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
        name: `@fluid-internal/${monoRepo.kind.toLowerCase()}`,
        version: monoRepo.version,
        private: true,
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
    console.log(`${monoRepo.kind}: ${format(devDepCount)}/${format(depCount + devDepCount)} devDependencies`);
    return generateMonoRepoPackageLockJson(monoRepo, repoPackageJson);
}

async function main() {
    const timer = new Timer(commonOptions.timer);

    const resolvedRoot = await getResolvedFluidRoot();

    // Load the package
    const repo = new FluidRepo(resolvedRoot, false);
    timer.time("Package scan completed");

    const releaseGroup = repo.monoRepos.get(kind);
    if(releaseGroup === undefined) {
        throw new Error(`release group couldn't be found.`);
    }

    await generateMonoRepoInstallPackageJson(releaseGroup);
}

main().catch(error => {
    console.error("ERROR: Unexpected error");
    console.error(error.stack);
});
