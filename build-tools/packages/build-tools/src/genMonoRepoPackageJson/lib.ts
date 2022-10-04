/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import path from "path";

import { commonOptions } from "../common/commonOptions";
import { Logger } from "../common/logging";
import { MonoRepo } from "../common/monoRepo";
import { Package } from "../common/npmPackage";
import { readJsonAsync, writeFileAsync } from "../common/utils";

function format(n: number) {
    return n.toString().padStart(4);
}

/**
 * Because lerna doesn't distinguish between dependencies and devDependencies, this function will use the
 * lerna-package-lock.json and patch up the "dev" field in the dependencies and output it to repo-package-lock.json.
 */
async function generateMonoRepoPackageLockJson(
    monoRepo: MonoRepo,
    repoPackageJson: any,
    log?: Logger,
) {
    // Patching the package-lock file
    const repoPackageLockJson = await readJsonAsync(
        path.join(monoRepo.repoPath, "lerna-package-lock.json"),
    );

    let totalDevCount = 0;
    let topLevelDevCount = 0;

    const setDev = (item: any) => {
        totalDevCount++;
        item.dev = true;
        if (!item.dependencies) {
            return;
        }
        for (const dep in item.dependencies) {
            setDev(item.dependencies[dep]);
        }
    };

    // Assume all of them are dev dependencies
    // eslint-disable-next-line guard-for-in, no-restricted-syntax
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
        // Checking item.dependencies !== undefined is not sufficient here.
        if (item.dependencies) {
            // mark unhoisted dependencies recursively
            // eslint-disable-next-line guard-for-in, no-restricted-syntax
            for (const dep in item.dependencies) {
                markNonDev(dep, topRef, item.dependencies[dep], refStack);
            }
        }
        // Mark the hoisted dependencies
        // eslint-disable-next-line no-restricted-syntax
        for (const req in item.requires) {
            if (
                !refStack.some(
                    (scope) => scope.dependencies && scope.dependencies[req] !== undefined,
                )
            ) {
                markTopLevelNonDev(req, name, topRef);
            }
        }
        refStack.pop();
    };

    const markTopLevelNonDev = (dep: string, ref: string, topRef: string) => {
        const item = repoPackageLockJson.dependencies[dep];
        if (!item) {
            throw new Error(
                `Missing ${dep} in lock file referenced by ${ref} from ${topRef} in ${monoRepo.kind.toLowerCase()}`,
            );
        }
        if (commonOptions.verbose) {
            log?.verbose(`NonDev Ref: ${topRef}..${ref} => ${dep}`);
        }

        if (item.dev) {
            topLevelDevCount--;
            markNonDev(dep, dep, item, []);
        }
    };

    // Go thru the non-dev dependencies in the package.json file and recursively mark the dependency tree as non-dev
    // eslint-disable-next-line guard-for-in, no-restricted-syntax
    for (const dep in repoPackageJson.dependencies) {
        markTopLevelNonDev(dep, "<root>", "<root>");
    }

    log?.info(
        `${monoRepo.kind}: ${format(totalDevCount)}/${format(totalCount)} locked devDependencies`,
    );
    log?.info(
        `${monoRepo.kind}: ${format(topLevelDevCount)}/${format(
            topLevelTotalCount,
        )} top level locked devDependencies`,
    );
    return writeFileAsync(
        path.join(monoRepo.repoPath, "repo-package-lock.json"),
        JSON.stringify(repoPackageLockJson, undefined, 2),
    );
}

interface PackageJson {
    name: string;
    version: string;
    private?: boolean;
    dependencies: { [key: string]: string };
    devDependencies: { [key: string]: string };
}

function processDependencies(
    repoPackageJson: PackageJson,
    packageJson: PackageJson,
    packageMap: Map<string, Package>,
) {
    let depCount = 0;
    // eslint-disable-next-line no-restricted-syntax
    for (const dep in packageJson.dependencies) {
        if (packageMap.has(dep)) {
            continue;
        }
        const version = packageJson.dependencies[dep];
        const existing = repoPackageJson.dependencies[dep];
        if (existing) {
            if (existing !== version) {
                throw new Error(
                    `Dependency version mismatch for ${dep}: ${existing} and ${version}`,
                );
            }
            continue;
        }
        repoPackageJson.dependencies[dep] = version;
        depCount++;
    }
    return depCount++;
}

function processDevDependencies(
    repoPackageJson: PackageJson,
    packageJson: PackageJson,
    packageMap: Map<string, Package>,
) {
    let devDepCount = 0;
    // eslint-disable-next-line no-restricted-syntax
    for (const dep in packageJson.devDependencies) {
        if (packageMap.has(dep)) {
            continue;
        }
        const version = packageJson.devDependencies[dep];
        const existing = repoPackageJson.dependencies[dep] ?? repoPackageJson.devDependencies[dep];
        if (existing) {
            if (existing !== version) {
                throw new Error(
                    `Dependency version mismatch for ${dep}: ${existing} and ${version}`,
                );
            }
            continue;
        }
        repoPackageJson.devDependencies[dep] = packageJson.devDependencies[dep];
        devDepCount++;
    }
    return devDepCount++;
}

/**
 * Generates the corresponding package.json for the lerna project by gathering all the
 * dependencies from all the packages, and outputs it to repo-package.json.
 */
export async function generateMonoRepoInstallPackageJson(monoRepo: MonoRepo, log?: Logger) {
    const packageMap = new Map<string, Package>(monoRepo.packages.map((pkg) => [pkg.name, pkg]));
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

    await writeFileAsync(
        path.join(monoRepo.repoPath, "repo-package.json"),
        JSON.stringify(repoPackageJson, undefined, 2),
    );
    log?.info(
        `${monoRepo.kind}: ${format(devDepCount)}/${format(
            depCount + devDepCount,
        )} devDependencies`,
    );
    return generateMonoRepoPackageLockJson(monoRepo, repoPackageJson, log);
}
