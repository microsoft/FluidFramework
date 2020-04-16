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

type VersionBag = { [key: string]: string };

function saveVersion(versions: VersionBag, name: string, version: string, monoRepo?: MonoRepo) {
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
    const versions: VersionBag = {};

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

/**
 * Execute a command. If there is an error, print error message and exit process
 * 
 * @param cmd Command line to execute
 * @param dir dir the directory to execute on
 * @param error description of command line to print when error happens
 */
async function exec(cmd: string, dir: string, error: string) {
    const result = await execWithErrorAsync(cmd, { cwd: dir }, dir, false);
    if (result.error) {
        console.error(`ERROR: Unable to ${error}`)
        process.exit(1);
    }
    return result.stdout;
}

/**
 * Execute git command
 * 
 * @param command the git command
 * @param resolvedRoot the directory to run in
 * @param error description of command line to print when error happens
 */
async function gitExec(command: string, resolvedRoot: string, error: string) {
    return exec(`git ${command}`, resolvedRoot, error);
}

/**
 * Execute git tag command
 * 
 * @param repo fluid repo 
 * @param tags array of tags to add to after it is done.
 * @param tag the tag to add
 */
async function gitTag(resolvedRoot: string, tags: string[], tag: string) {
    await gitExec(`tag ${tag}`, resolvedRoot, `adding tag ${tag}`);
    tags.push(tag);
}

/**
 * Get the current git branch name
 * @param resolvedRoot the repo root directory
 */
async function getCurrentBranchName(resolvedRoot: string) {
    const revParseOut = await gitExec("rev-parse --abbrev-ref HEAD", resolvedRoot, "get current branch");
    return revParseOut.split("\n")[0];
}

/**
 * Determine either we want to bump minor on master or patch version on release/* based on branch name
 * 
 * @param resolvedRoot the repo root directory
 */
async function getVersionBumpKind(resolvedRoot: string) {
    if (paramBumpVersionKind !== undefined) {
        return paramBumpVersionKind;
    }

    // Determine the kind of bump
    const branchName = await getCurrentBranchName(resolvedRoot);
    if (branchName !== "master" && !branchName.startsWith("release/")) {
        console.error(`ERROR: Unrecognized branch '${branchName}'`);
        process.exit(2)
    }
    return branchName === "master" ? "minor" : "patch";
}

/**
 * Start with client and generator package needed to be bumped, determine whether their dependent monorepo or packages 
 * points to the current version in the repo and needs to be bumped as well
 */
async function collectionBumpInfo(repo: FluidRepoBase, packageMap: Map<string, Package>, generatorPackage: Package, templatePackage: Package) {
    const packageNeedBump = new Set<Package>();
    let serverNeedBump = false;

    const depVersions: VersionBag = {};
    const checkPackageNeedBump = (pkg: Package) => {
        for (const { name: dep, version } of pkg.combinedDependencies) {
            const depBuildPackage = packageMap.get(dep);
            if (depBuildPackage) {
                let depVersion = depBuildPackage.version;
                // TODO: switch to semver.satisfies(`${depVersion}-0`, version) instead when we get out of legacy version scheme <= 0.15 for some packages
                if (`^${depVersion}-0` === version || `^${depVersion}` === version) {
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

    saveVersion(depVersions, generatorPackage.name, generatorPackage.version);
    saveVersion(depVersions, templatePackage.name, templatePackage.version);

    const oldVersions = collectVersions(repo, generatorPackage, templatePackage);
    console.log("Release Versions:");
    for (const name in oldVersions) {
        console.log(`${name.padStart(40)}: ${depVersions[name].padStart(10)} ${!oldVersions || oldVersions[name] !== depVersions[name] ? "(old)" : "(new)"}`);
    }
    console.log();

    return { serverNeedBump, packageNeedBump, oldVersions };
}

async function createVersionBranch(repo: FluidRepoBase, version: string) {
    const versionBranch = `local/${version}`
    console.log(`Creating branch ${versionBranch}`);
    await gitExec(`checkout -b ${versionBranch}`, repo.resolvedRoot, `create branch ${versionBranch}`);
    return versionBranch;
}

async function bumpRepo(repo: FluidRepoBase, versionBump: string, serverNeedBump: boolean, packageNeedBump: Set<Package>) {
    const bumpMonoRepo = async (monoRepo: MonoRepo) => {
        return exec(`npx lerna version ${versionBump} --no-push --no-git-tag-version -y && npm run build:genver`, monoRepo.repoPath, "bump mono repo");
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
        await exec(cmd, pkg.directory, `bump version on ${pkg.name}`);
    }

    // Package json has changed. Reload.
    repo.reload();
}

async function bumpGeneratorFluid(packageMap: Map<string, Package>, generatorPackage: Package, templatePackage: Package, versionBump: string) {
    console.log("Bumping generator version");

    await bumpPackageDependencies(templatePackage, packageMap);
    await exec(`npm version ${versionBump}`, templatePackage.directory, "bump yo template");
    await exec(`npm version ${versionBump}`, generatorPackage.directory, "bump yo generator");

    // Generate has changed. Reload.
    generatorPackage.reload();
    templatePackage.reload();
}

async function bumpCurrentBranch(repo: FluidRepoBase, packageMap: Map<string, Package>, generatorPackage: Package, templatePackage: Package, versionBump: string, serverNeedBump: boolean, packageNeedBump: Set<Package>, oldVersions: VersionBag) {
    await bumpRepo(repo, versionBump, serverNeedBump, packageNeedBump);
    await bumpGeneratorFluid(packageMap, generatorPackage, templatePackage, versionBump);

    const currentBranchName = await getCurrentBranchName(repo.resolvedRoot);
    const newVersions = collectVersions(repo, generatorPackage, templatePackage);
    const newVersion = newVersions[MonoRepoKind[MonoRepoKind.Client]];

    console.log(`Committing bump version to ${newVersion} changes in ${currentBranchName}`);
    await gitExec(`commit -a -m "Bump development version for clients to ${newVersion}"`, repo.resolvedRoot, "create bumped version commit");
    console.log(`\nRepo Versions in branch ${currentBranchName}:`);
    for (const name in newVersions) {
        if (!oldVersions || oldVersions[name] !== newVersions[name]) {
            console.log(`${name.padStart(40)}: ${oldVersions[name].padStart(10)} -> ${newVersions[name].padEnd(10)}`);
        } else {
            console.log(`${name.padStart(40)}: ${newVersions[name].padStart(10)} (unchanged)`);
        }
    }
}

/**
 * Bump package version of the client monorepo, 
 * If it has dependencies to the current version of the other monorepo packages, bump package version of those too
 * 
 * If --commit or --release is specified, the bumpped version changes will be committed and a release branch will be created
 */
async function bumpVersion(repo: FluidRepoBase) {
    const currentBranch =  await getCurrentBranchName(repo.resolvedRoot);
    const versionBump = await getVersionBumpKind(repo.resolvedRoot);
    console.log(`Bumping ${versionBump} version`);

    const packageMap = repo.createPackageMap();
    const generatorDir = path.join(repo.resolvedRoot, "tools", "generator-fluid");
    const generatorPackage = new Package(path.join(generatorDir, "package.json"));
    const templatePackage = new Package(path.join(generatorDir, "app", "templates", "package.json"));

    const { serverNeedBump, packageNeedBump, oldVersions } = await collectionBumpInfo(repo, packageMap, generatorPackage, templatePackage);
    
    const releaseVersion = oldVersions[MonoRepoKind[MonoRepoKind.Client]];
    let releaseBranch: string;
    if (versionBump !== "patch") {
        // This is master, we need to creating the release branch and bump the version
        const releaseBranchVersion = `${semver.major(releaseVersion)}.${semver.minor(releaseVersion)}`;
        releaseBranch = await createVersionBranch(repo, `${releaseBranchVersion}.x`);
    } else {
        releaseBranch = currentBranch;
    }

    // Create the release and tag
    const pendingReleaseBranch = await createVersionBranch(repo, releaseVersion);

    // Fix the pre-release dependency.
    console.log("Fix pre-release dependencies");
    const packageNeedBumpName = new Set<string>();
    for (const pkg of packageNeedBump) {
        packageNeedBumpName.add(pkg.name);
    }
    if (await bumpDependencies(repo, true, serverNeedBump, packageNeedBumpName, true)) {
        await gitExec(`commit -a -m "Remove pre-release dependencies for client release ${releaseVersion}"`, repo.resolvedRoot, "pre-release version commit");
    }

    const tags: string[] = [];
    console.log("Tagging release");
    for (const pkg of packageNeedBump) {
        const name = pkg.name.split("/").pop()!;
        gitTag(repo.resolvedRoot, tags, `${name}_v${pkg.version}`);
    }

    if (serverNeedBump) {
        const serverVersion = oldVersions[MonoRepoKind[MonoRepoKind.Server]];
        gitTag(repo.resolvedRoot, tags, `fluid-server_v${serverVersion}`);
    }

    gitTag(repo.resolvedRoot, tags, `fluid-client_v${releaseVersion}`);
    gitTag(repo.resolvedRoot, tags, `fluid-generator_v${releaseVersion}`);

    let unreleased_branch: string | undefined;
    if (versionBump !== "patch") {
        unreleased_branch = await createVersionBranch(repo, currentBranch);
        await bumpCurrentBranch(repo, packageMap, generatorPackage, templatePackage, versionBump, serverNeedBump, packageNeedBump, oldVersions);

        // switch package to pendingReleaseBranch
        await gitExec(`checkout ${pendingReleaseBranch}`, repo.resolvedRoot, `switch to branch ${pendingReleaseBranch}`);
        repo.reload();
        generatorPackage.reload();
        templatePackage.reload();
    }

    // Do the patch version bump
    await bumpCurrentBranch(repo, packageMap, generatorPackage, templatePackage, "patch", serverNeedBump, packageNeedBump, oldVersions);

    console.log();
    console.log("Push these tags in dependencies order and wait for the package to be generated between these tags");
    for (const tag of tags) {
        console.log(`  ${tag}`);
    }

    console.log(`Then merge branch ${pendingReleaseBranch} into ${releaseBranch}`);
    if (unreleased_branch) {
        console.log(`And merge branch ${unreleased_branch} into ${currentBranch}`);
    }
}

/**
 * Bump cross package/monorepo dependencies
 * 
 * Go all the packages in the repo and update the dependencies to the packages specified version to the one currently in the repo
 * 
 * @param repo the repo to operate one
 * @param bumpDepClient update dependencies to client packages to current in repo version
 * @param bumpDepServer update dependencies to server packages to current in repo version
 * @param bumpDepPackages update dependencies to these set of packages to current in repo version
 * @param release make dependencies target release version instead of pre-release versions (e.g. ^0.16.0 vs ^0.16.0-0)
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

    let changed = false;
    const bumpPackageMap = new Map<string, Package>(bumpPackages.map(pkg => [pkg.name, pkg]));
    for (const pkg of repo.packages.packages) {
        if (await bumpPackageDependencies(pkg, bumpPackageMap, release)) {
            changed = true;
        }
    }
    return changed;
}

/**
 * Load the repo and either do version bump or dependencies bump
 */
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