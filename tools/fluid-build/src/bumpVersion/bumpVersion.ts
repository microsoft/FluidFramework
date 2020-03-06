/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */


import * as path from "path";
import { commonOptions, commonOptionString, parseOption } from "../common/commonOptions";
import { Timer } from "../common/timer";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import { FluidRepoBase, MonoRepo } from "../common/fluidRepoBase";
import * as semver from "semver";
import { Package } from "../common/npmPackage";
import { execWithErrorAsync, ExecAsyncResult } from "../common/utils";
import { logVerbose } from "../common/logging";

function printUsage() {
    console.log(
        `
Usage: fluid-bump-version <options>
Options:
${commonOptionString}
`);
}

function versionCheck() {
    const pkg = require(path.join(__dirname, "..", "..", "package.json"));
    const builtVersion = "0.0.5";
    if (pkg.version > builtVersion) {
        console.warn(`WARNING: layer-check is out of date, please rebuild (built: ${builtVersion}, package: ${pkg.version})\n`);
    }
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

async function bumpGeneratorFluid(repoRoot: string, buildPackages: Map<string, Package>) {
    const pkgDir = path.join(repoRoot, "tools", "generator-fluid");
    await execWithErrorAsync("npm version minor", { cwd: pkgDir }, pkgDir, false);

    const templateDir = path.join(pkgDir, "app", "templates");
    await execWithErrorAsync("npm version minor", { cwd: templateDir }, templateDir, false);

    const templatePackage = new Package(require(path.join(templateDir, "package.json")));
    
    for (const { name, dev } of templatePackage.combinedDependencies) {
        const pkg = buildPackages.get(name);
        if (pkg) {
            if (dev) {
                templatePackage.packageJson.devDependencies[name] = `^${pkg.version}`;
            } else {
                templatePackage.packageJson.dependencies[name] = `^${pkg.version}`;
            }
        }
    }
    return templatePackage.savePackageJson();
}

async function main() {
    const timer = new Timer(commonOptions.timer);

    versionCheck();

    const resolvedRoot = await getResolvedFluidRoot();

    // Load the package
    const repo = new FluidRepoBase(resolvedRoot);
    const packages = repo.packages;
    timer.time("Package scan completed");

    const packageNeedBump = new Set<Package>();
    let serverNeedBump = false;
    const buildPackages = repo.createPackageMap();

    const checkPackageNeedBump = (pkg: Package) => {
        for (const { name: dep, version } of pkg.combinedDependencies) {
            const depBuildPackage = buildPackages.get(dep);
            if (depBuildPackage && semver.satisfies(depBuildPackage.version, version)) {
                const depMonoRepo = repo.getMonoRepo(depBuildPackage);

                if (depMonoRepo === MonoRepo.None) {
                    if (!packageNeedBump.has(depBuildPackage)) {
                        packageNeedBump.add(depBuildPackage);
                        logVerbose(`${depBuildPackage.nameColored}: Add from ${pkg.nameColored} ${version}`)
                        checkPackageNeedBump(depBuildPackage);
                    }
                } else if (depMonoRepo === MonoRepo.Server) {
                    serverNeedBump = true;
                }
            }
        }
    };

    const checkMonoRepoNeedBump = (checkRepo: MonoRepo) => {
        packages.packages.forEach(pkg => {
            const monoRepo = repo.getMonoRepo(pkg);
            if (monoRepo !== checkRepo) {
                return;
            }
            checkPackageNeedBump(pkg);
        });
    };



    checkMonoRepoNeedBump(MonoRepo.Client);

    if (serverNeedBump) {
        checkMonoRepoNeedBump(MonoRepo.Server);
    }


    const bumpMonoRepo = async (monoRepo: MonoRepo) => {
        const repoPath = repo.getMonoRepoPath(monoRepo)!;
        return await execWithErrorAsync("npx lerna version minor --no-push --no-git-tag-version -y && npm run build:genver", {
            cwd: repoPath,
        }, repoPath, false);
    }

    console.log("Bumping client version");
    await bumpMonoRepo(MonoRepo.Client)

    if (serverNeedBump) {
        console.log("Bumping server version");
        await bumpMonoRepo(MonoRepo.Server);
    }

    for (const pkg of packageNeedBump) {
        console.log(`Bumping ${pkg.name}`);
        let cmd = "npm version minor";
        if (pkg.getScript("build:genver")) {
            cmd += " && npm run build:genver";
        }
        await execWithErrorAsync(cmd, { cwd: pkg.directory }, pkg.directory, false);
    }

    return bumpGeneratorFluid(resolvedRoot, buildPackages);
}

main().catch(e =>
    console.error("ERROR: unexpected error", JSON.stringify(e, undefined, 2))
);