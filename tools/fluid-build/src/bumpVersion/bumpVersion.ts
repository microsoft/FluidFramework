/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */


import * as path from "path";
import { commonOptions, commonOptionString, parseOption } from "../common/commonOptions";
import { Timer } from "../common/timer";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import { FluidRepoBase } from "../common/fluidRepoBase";
import { MonoRepo, MonoRepoKind } from "../common/monoRepo";
import * as semver from "semver";
import { Package } from "../common/npmPackage";
import { execWithErrorAsync } from "../common/utils";
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
        console.warn(`WARNING: fluid-bump-version is out of date, please rebuild (built: ${builtVersion}, package: ${pkg.version})\n`);
    }
}

let paramBumpVersionKind: string | undefined;
let paramCommit = false;
let paramBumpDep = false;
let paramBumpDepClient = false;
let paramBumpDepServer = false;
const paramBumpDepPackages = new Set<string>();

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

        if (arg === "-d" || arg === "--dep") {
            const dep = process.argv[++i];
            if (dep === undefined) {
                console.error("ERROR: Missing arguments for --dep");
                process.exit(-1);
            }
            if (dep.toLowerCase() === "client") {
                paramBumpDepClient = true;
            } else if (dep.toLowerCase() === "server") {
                paramBumpDepServer = true;
            } else {
                paramBumpDepPackages.add(dep);
            }
            paramBumpDep = true;
            continue;
        }

        if (arg === "--minor") {
            paramBumpVersionKind = "minor";
            continue;
        }

        if (arg === "--patch") {
            paramBumpVersionKind = "patch";
            continue;
        }

        if (arg === "--bump") {
            continue;
        }

        if (arg === "--commit") {
            paramCommit = true;
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

function saveVersion(versions: { [key: string]: string }, name: string, version: string, monoRepo?: MonoRepo) {
    if (monoRepo === undefined) {
        versions[name] = version;
    } else if (name.startsWith("@fluid-example/version-test")) {
        // Ignore example packages
        return;
    } else if (versions[MonoRepoKind[monoRepo.kind]]) {
        if (versions[MonoRepoKind[monoRepo.kind]] !== version) {
            throw new Error(`Inconsistent version within Monorepo ${name} ${version}`);
        }
    } else {
        versions[MonoRepoKind[monoRepo.kind]] = version;
    }
}

function collectVersions(repo: FluidRepoBase, generatorPackage: Package, templatePackage: Package) {
    const versions: { [key: string]: string } = {};

    repo.packages.packages.forEach(pkg => {
        saveVersion(versions, pkg.name, pkg.version, pkg.monoRepo);
    });

    saveVersion(versions, generatorPackage.name, generatorPackage.version);
    saveVersion(versions, templatePackage.name, templatePackage.version);
    return versions;
}

async function bumpPackageDependencies(pkg: Package, packageMap: Map<string, Package>, release: boolean = false) {
    let changed = false;
    const suffix = release ? "" : "-0";
    for (const { name, dev } of pkg.combinedDependencies) {
        const depPackage = packageMap.get(name);
        if (depPackage && !MonoRepo.isSame(depPackage.monoRepo, pkg.monoRepo)) {
            const depVersion = `^${depPackage.version}${suffix}`;
            if (dev) {
                if (pkg.packageJson.devDependencies[name] !== depVersion) {
                    changed = true;
                    pkg.packageJson.devDependencies[name] = depVersion;
                }
            } else {
                if (pkg.packageJson.dependencies[name] !== depVersion) {
                    changed = true;
                    pkg.packageJson.dependencies[name] = depVersion;
                }
            }
        }
    }

    if (changed) {
        await pkg.savePackageJson();
    }
    return changed;
}

async function bumpGeneratorFluid(packageMap: Map<string, Package>, generatorPackage: Package, templatePackage: Package, versionBump: string) {
    console.log("Bumping generator version");

    await bumpPackageDependencies(templatePackage, packageMap);
    await execWithErrorAsync(`npm version ${versionBump}`, { cwd: templatePackage.directory }, templatePackage.directory, false);
    await execWithErrorAsync(`npm version ${versionBump}`, { cwd: generatorPackage.directory }, generatorPackage.directory, false);
}

async function gitExec(command: string, resolvedRoot: string, error: string) {
    const result = await execWithErrorAsync(`git ${command}`, { cwd: resolvedRoot }, resolvedRoot, false);
    if (result.error) {
        console.error(`ERROR: Unable to ${error}`)
        process.exit(1);
    }
    return result.stdout;
}

async function getCurrentBranchName(resolvedRoot: string) {
    const revParseOut = await gitExec("rev-parse --abbrev-ref HEAD", resolvedRoot, "get current branch");

    const branchName = revParseOut.split("\n")[0];
    if (branchName !== "master" && !branchName.startsWith("release/")) {
        console.error(`ERROR: Unrecognized branch '${branchName}'`);
        process.exit(2)
    }

    return branchName;
}

async function getVersionBumpKind(resolvedRoot: string) {
    if (paramBumpVersionKind !== undefined) {
        return paramBumpVersionKind;
    }

    // Determine the kind of bump
    const branchName = await getCurrentBranchName(resolvedRoot);
    return branchName === "master" ? "minor" : "patch";
}

/**
 * Bump package version of the client monorepo, 
 * If it has dependencies to the current version of the other monorepo packages, bump package version of those too
 * 
 * If --commit or --release is specified, the bumpped version changes will be committed and a release branch will be created
 */
async function bumpVersion(repo: FluidRepoBase) {
    const versionBump = await getVersionBumpKind(repo.resolvedRoot);
    console.log(`Bumping ${versionBump} version`);

    const packageNeedBump = new Set<Package>();
    let serverNeedBump = false;
    const packageMap = repo.createPackageMap();

    const depVersions: { [key: string]: string } = {};
    const checkPackageNeedBump = (pkg: Package) => {
        for (const { name: dep, version } of pkg.combinedDependencies) {
            const depBuildPackage = packageMap.get(dep);
            if (depBuildPackage) {
                let depVersion = depBuildPackage.version;
                if (semver.satisfies(depVersion, version)) {
                    if (depBuildPackage.monoRepo === undefined) {
                        if (!packageNeedBump.has(depBuildPackage)) {
                            packageNeedBump.add(depBuildPackage);
                            logVerbose(`${depBuildPackage.nameColored}: Add from ${pkg.nameColored} ${version}`)
                            checkPackageNeedBump(depBuildPackage);
                        }
                    } else if (depBuildPackage.monoRepo.kind === MonoRepoKind.Server) {
                        serverNeedBump = true;
                    }
                } else {
                    depVersion = semver.minVersion(version)!.version;
                }
                saveVersion(depVersions, dep, depVersion, depBuildPackage.monoRepo);
            }
        }
    };

    const checkMonoRepoNeedBump = (checkRepo: MonoRepoKind) => {
        repo.packages.packages.forEach(pkg => {
            if (pkg.monoRepo?.kind !== checkRepo) {
                return;
            }
            checkPackageNeedBump(pkg);
        });
    };

    checkMonoRepoNeedBump(MonoRepoKind.Client);

    if (serverNeedBump) {
        checkMonoRepoNeedBump(MonoRepoKind.Server);
    }

    const generatorDir = path.join(repo.resolvedRoot, "tools", "generator-fluid");
    const generatorPackage = new Package(path.join(generatorDir, "package.json"));
    const templatePackage = new Package(path.join(generatorDir, "app", "templates", "package.json"));
    saveVersion(depVersions, generatorPackage.name, generatorPackage.version);
    saveVersion(depVersions, templatePackage.name, templatePackage.version);

    const oldVersions = collectVersions(repo, generatorPackage, templatePackage);
    console.log("Release Versions:");
    for (const name in oldVersions) {
        console.log(`${name.padStart(40)}: ${depVersions[name].padStart(10)} ${!oldVersions || oldVersions[name] !== depVersions[name] ? "(old)" : "(new)"}`);
    }
    console.log();

    const bumpMonoRepo = async (monoRepo: MonoRepo) => {
        const repoPath = monoRepo.repoPath;
        return await execWithErrorAsync(`npx lerna version ${versionBump} --no-push --no-git-tag-version -y && npm run build:genver`, {
            cwd: repoPath,
        }, repoPath, false);
    }

    console.log("Bumping client version");
    await bumpMonoRepo(repo.clientMonoRepo)

    if (serverNeedBump) {
        console.log("Bumping server version");
        await bumpMonoRepo(repo.serverMonoRepo);
    }

    for (const pkg of packageNeedBump) {
        console.log(`Bumping ${pkg.name}`);
        let cmd = `npm version ${versionBump}`;
        if (pkg.getScript("build:genver")) {
            cmd += " && npm run build:genver";
        }
        await execWithErrorAsync(cmd, { cwd: pkg.directory }, pkg.directory, false);
    }

    // Package json has changed. Reload.
    repo.reload();

    await bumpGeneratorFluid(packageMap, generatorPackage, templatePackage, versionBump);

    // Generate has changed. Reload.
    generatorPackage.reload();
    templatePackage.reload();

    console.log("\nRepo Versions:");
    const newVersions = collectVersions(repo, generatorPackage, templatePackage);
    for (const name in newVersions) {
        if (!oldVersions || oldVersions[name] !== newVersions[name]) {
            console.log(`${name.padStart(40)}: ${oldVersions[name].padStart(10)} -> ${newVersions[name].padEnd(10)}`);
        } else {
            console.log(`${name.padStart(40)}: ${newVersions[name].padStart(10)} (unchanged)`);
        }
    }

    if (paramCommit) {
        console.log("Committing changes");
        const releaseVersion = oldVersions[MonoRepoKind[MonoRepoKind.Client]];
        if (versionBump !== "patch") {
            const releaseBranchVersion = `${semver.major(releaseVersion)}.${semver.minor(releaseVersion)}`;
            const releaseBranch = `release/${releaseBranchVersion}.x`;
            console.log(`Creating release branch ${releaseBranch}`);
            await gitExec(`checkout -b ${releaseBranch}`, repo.resolvedRoot, `create branch ${releaseBranch}`);
            await gitExec("checkout -", repo.resolvedRoot, "checkout previous branch");
        }

        const pendingReleaseBranch = `release/${releaseVersion}`
        console.log(`Creating pending branch ${pendingReleaseBranch}`);
        await gitExec(`checkout -b ${pendingReleaseBranch}`, repo.resolvedRoot, `create branch ${pendingReleaseBranch}`);
        await gitExec("checkout -", repo.resolvedRoot, "checkout previous branch");

        const newVersion = newVersions[MonoRepoKind[MonoRepoKind.Client]];
        console.log(`Commit bump version ${newVersion}`);
        await gitExec(`commit -a -m "Bump version to ${newVersion}`, repo.resolvedRoot, "create bumped version commit");

        await gitExec(`checkout -b ${pendingReleaseBranch}`, repo.resolvedRoot, `switch to branch ${pendingReleaseBranch}`);

        // we switch branch. reload
        repo.reload();
        generatorPackage.reload();
        templatePackage.reload();

        const packageNeedBumpName = new Set<string>();
        for (const pkg of packageNeedBump) {
            packageNeedBumpName.add(pkg.name);
        }
        await bumpDependencies(repo, true, serverNeedBump, packageNeedBumpName, true);

        await gitExec(`commit -a -m "Bump version to ${newVersion}`, repo.resolvedRoot, "create bumped version commit");
    }
}

/**
 * Bump cross package/monorepo dependencies
 */
async function bumpDependencies(repo: FluidRepoBase, bumpDepClient: boolean, bumpDepServer: boolean, bumpDepPackages: Set<string>, release: boolean = false) {
    const bumpPackages = repo.packages.packages.filter(pkg => {
        if (bumpDepClient && pkg.monoRepo === repo.clientMonoRepo) {
            return true;
        }
        if (bumpDepServer && pkg.monoRepo === repo.serverMonoRepo) {
            return true;
        }
        if (bumpDepPackages.has(pkg.name)) {
            return true;
        }
        return false;
    });

    if (bumpPackages.length === 0) {
        console.error("ERROR: Unable to find dependencies to bump");
        process.exit(-2);
    }

    const bumpPackageMap = new Map<string, Package>(bumpPackages.map(pkg => [pkg.name, pkg]));

    let changed = false;
    for (const pkg of repo.packages.packages) {
        if (await bumpPackageDependencies(pkg, bumpPackageMap, release)) {
            changed = true;
        }
    }
}

async function main() {
    const timer = new Timer(commonOptions.timer);

    versionCheck();

    const resolvedRoot = await getResolvedFluidRoot();

    // Load the package
    const repo = new FluidRepoBase(resolvedRoot);
    timer.time("Package scan completed");

    if (paramBumpDep) {
        return bumpDependencies(repo, paramBumpDepClient, paramBumpDepServer, paramBumpDepPackages);
    }
    return bumpVersion(repo);
}

main().catch(e => {
    console.error("ERROR: unexpected error", JSON.stringify(e, undefined, 2))
    if (e.stack) {
        console.error(`Stack:\n${e.stack}`);
    }
});