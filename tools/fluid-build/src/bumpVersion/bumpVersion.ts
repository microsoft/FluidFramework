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
import { logVerbose } from "../common/logging";
import { GitRepo, fatal, exec } from "./utils";

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

type VersionBumpType = "minor" | "patch";

let paramBumpVersionKind: VersionBumpType | undefined;
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
                fatal("ERROR: Missing arguments for --dep");
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

class BumpVersion {
    private readonly timer: Timer;
    private readonly repo: FluidRepoBase;
    private readonly fullPackageMap: Map<string, Package>;
    private readonly generatorPackage: Package;
    private readonly templatePackage: Package;

    constructor(private readonly gitRepo: GitRepo, private readonly originalBranchName: string) {
        this.timer = new Timer(commonOptions.timer);

        // Load the package
        this.repo = new FluidRepoBase(this.gitRepo.resolvedRoot);
        this.timer.time("Package scan completed");

        this.fullPackageMap = this.repo.createPackageMap();

        const generatorDir = path.join(this.gitRepo.resolvedRoot, "tools", "generator-fluid");
        this.generatorPackage = new Package(path.join(generatorDir, "package.json"));
        this.templatePackage = new Package(path.join(generatorDir, "app", "templates", "package.json"));
    }

    /**
     * Bump the dependencies of a package based on the what's in the packageMap, and save the package.json
     * 
     * @param pkg the package to bump dependency versions
     * @param packageMap the map of package that needs to bump
     * @param release use release or pre-release version in dependencies
     */
    private static async bumpPackageDependencies(pkg: Package, packageMap: Map<string, Package>, release: boolean = false) {
        let changed = false;
        const suffix = release ? "" : "-0";
        for (const { name, dev } of pkg.combinedDependencies) {
            const depPackage = packageMap.get(name);
            if (depPackage && !MonoRepo.isSame(depPackage.monoRepo, pkg.monoRepo)) {
                const depVersion = `^${depPackage.version}${suffix}`;
                const dependencies = dev ? pkg.packageJson.devDependencies : pkg.packageJson.dependencies;
                if (dependencies[name] !== depVersion) {
                    changed = true;
                    dependencies[name] = depVersion;
                }
            }
        }

        if (changed) {
            await pkg.savePackageJson();
        }
        return changed;
    }

    /**
     * Set the version for a package/monorepo into the version bag.
     * 
     * @param versions the version bag to save to
     * @param name name of the package
     * @param version version of the package
     * @param monoRepo the monoRepo of the package
     */
    private static saveVersion(versions: VersionBag, name: string, version: string, monoRepo?: MonoRepo) {
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

    /**
     * Collect the version of the packages in a VersionBag
     */
    private collectVersions() {
        const versions: VersionBag = {};

        this.repo.packages.packages.forEach(pkg => {
            BumpVersion.saveVersion(versions, pkg.name, pkg.version, pkg.monoRepo);
        });

        BumpVersion.saveVersion(versions, this.generatorPackage.name, this.generatorPackage.version);
        BumpVersion.saveVersion(versions, this.templatePackage.name, this.templatePackage.version);
        return versions;
    }

    /**
     * Determine either we want to bump minor on master or patch version on release/* based on branch name 
     */
    private async getVersionBumpKind(): Promise<VersionBumpType> {
        if (paramBumpVersionKind !== undefined) {
            return paramBumpVersionKind;
        }

        // Determine the kind of bump
        const branchName = this.originalBranchName;
        if (branchName !== "master" && !branchName!.startsWith("release/")) {
            fatal(`ERROR: Unrecognized branch '${branchName}'`);
        }
        return branchName === "master" ? "minor" : "patch";
    }

    /**
     * Start with client and generator package marka as to be bumped, determine whether their dependent monorepo or packages 
     * has the same version to the current version in the repo and needs to be bumped as well
     */
    private async collectionBumpInfo() {
        const packageNeedBump = new Set<Package>();
        let serverNeedBump = false;

        const depVersions: VersionBag = {};
        const checkPackageNeedBump = (pkg: Package) => {
            for (const { name: dep, version } of pkg.combinedDependencies) {
                const depBuildPackage = this.fullPackageMap.get(dep);
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
                    BumpVersion.saveVersion(depVersions, dep, depVersion, depBuildPackage.monoRepo);
                }
            }
        };

        const checkMonoRepoNeedBump = (checkRepo: MonoRepoKind) => {
            this.repo.packages.packages.forEach(pkg => {
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

        BumpVersion.saveVersion(depVersions, this.generatorPackage.name, this.generatorPackage.version);
        BumpVersion.saveVersion(depVersions, this.templatePackage.name, this.templatePackage.version);

        const oldVersions = this.collectVersions();
        console.log("Release Versions:");
        for (const name in oldVersions) {
            console.log(`${name.padStart(40)}: ${depVersions[name].padStart(10)} ${!oldVersions || oldVersions[name] !== depVersions[name] ? "(old)" : "(new)"}`);
        }
        console.log();

        return { serverNeedBump, packageNeedBump, oldVersions };
    }

    /**
     * Bump version of the repo
     * 
     * @param versionBump the kind of version bump
     */
    private async bumpRepo(versionBump: VersionBumpType, serverNeedBump: boolean, packageNeedBump: Set<Package>) {
        const bumpMonoRepo = async (monoRepo: MonoRepo) => {
            return exec(`npx lerna version ${versionBump} --no-push --no-git-tag-version -y && npm run build:genver`, monoRepo.repoPath, "bump mono repo");
        }

        console.log("  Bumping client version");
        await bumpMonoRepo(this.repo.clientMonoRepo)

        if (serverNeedBump) {
            console.log("  Bumping server version");
            await bumpMonoRepo(this.repo.serverMonoRepo);
        }

        for (const pkg of packageNeedBump) {
            console.log(`  Bumping ${pkg.name}`);
            let cmd = `npm version ${versionBump}`;
            if (pkg.getScript("build:genver")) {
                cmd += " && npm run build:genver";
            }
            await exec(cmd, pkg.directory, `bump version on ${pkg.name}`);
        }

        // Package json has changed. Reload.
        this.repo.reload();
    }

    /**
     * Bump version of the generator packages
     * 
     * @param versionBump the kind of version bump
     */
    private async bumpGeneratorFluid(versionBump: VersionBumpType) {
        console.log("  Bumping generator version");

        await BumpVersion.bumpPackageDependencies(this.templatePackage, this.fullPackageMap);
        await exec(`npm version ${versionBump}`, this.templatePackage.directory, "bump yo template");
        await exec(`npm version ${versionBump}`, this.generatorPackage.directory, "bump yo generator");

        // Generate has changed. Reload.
        this.generatorPackage.reload();
        this.templatePackage.reload();
    }

    /**
     * Create a commit with the version bump and return the repo transition state 
     * 
     * @param versionBump the kind of version Bump
     * @param serverNeedBump whether server version needs to be bump
     * @param packageNeedBump the set of packages that needs to be bump
     * @param oldVersions old versions
     */
    private async bumpCurrentBranch(versionBump: VersionBumpType, serverNeedBump: boolean, packageNeedBump: Set<Package>, oldVersions: VersionBag) {
        await this.bumpRepo(versionBump, serverNeedBump, packageNeedBump);
        await this.bumpGeneratorFluid(versionBump);

        const currentBranchName = await this.gitRepo.getCurrentBranchName();
        const newVersions = this.collectVersions();
        const newVersion = newVersions[MonoRepoKind[MonoRepoKind.Client]];

        console.log(`  Committing version bump to ${newVersion} into ${currentBranchName}`);
        // TODO: better commit message
        await this.gitRepo.commit(`Bump development version for clients to ${newVersion}`, "create bumped version commit");
        let repoState = `Repo Versions in branch ${currentBranchName}:`;
        for (const name in newVersions) {
            if (!oldVersions || oldVersions[name] !== newVersions[name]) {
                repoState += `\n${name.padStart(40)}: ${oldVersions[name].padStart(10)} -> ${newVersions[name].padEnd(10)}`;
            } else {
                repoState += `\n${name.padStart(40)}: ${newVersions[name].padStart(10)} (unchanged)`;
            }
        }
        return repoState;
    }

    /**
     * Bump package version of the client monorepo, 
     * If it has dependencies to the current version of the other monorepo packages, bump package version of those too
     * 
     * If --commit or --release is specified, the bumpped version changes will be committed and a release branch will be created
     */
    public async bumpVersion() {
        const versionBump = await this.getVersionBumpKind();
        console.log(`Bumping ${versionBump} version`);

        const { serverNeedBump, packageNeedBump, oldVersions } = await this.collectionBumpInfo();

        // -----------------------------------------------------------------------------------------------------
        // Create the release development branch if it is it not a patch upgrade
        // -----------------------------------------------------------------------------------------------------
        const releaseVersion = oldVersions[MonoRepoKind[MonoRepoKind.Client]];
        let releaseBranch: string;
        if (versionBump !== "patch") {
            // This is master, we need to creating the release branch and bump the version
            const releaseBranchVersion = `${semver.major(releaseVersion)}.${semver.minor(releaseVersion)}`;
            releaseBranch = `release/${releaseBranchVersion}.x`;
            console.log(`Creating release development branch ${releaseBranch}`);
            await this.gitRepo.createBranch(releaseBranch);
        } else {
            releaseBranch = this.originalBranchName;
        }

        // ------------------------------------------------------------------------------------------------------------------
        // Create the release in a temporary merge/<release version>, fix pre-release dependency (if needed) and create tag.
        // ------------------------------------------------------------------------------------------------------------------
        console.log(`Creating release ${releaseVersion}`);

        const pendingReleaseBranch = `merge/${releaseVersion}`;
        console.log(`  Creating temporary release branch ${pendingReleaseBranch}`)
        await this.gitRepo.createBranch(pendingReleaseBranch);

        // Fix the pre-release dependency.
        console.log("  Fix pre-release dependencies");
        const packageNeedBumpName = new Set<string>();
        for (const pkg of packageNeedBump) {
            packageNeedBumpName.add(pkg.name);
        }

        await this.bumpDependencies(`Remove pre-release dependencies for client release ${releaseVersion}`, true, serverNeedBump, packageNeedBumpName, true);

        console.log("  Tagging release");
        for (const pkg of packageNeedBump) {
            const name = pkg.name.split("/").pop()!;
            await this.gitRepo.tag(`${name}_v${pkg.version}`);
        }

        if (serverNeedBump) {
            const serverVersion = oldVersions[MonoRepoKind[MonoRepoKind.Server]];
            await this.gitRepo.tag(`fluid-server_v${serverVersion}`);
        }

        await this.gitRepo.tag(`fluid-client_v${releaseVersion}`);

        // ------------------------------------------------------------------------------------------------------------------
        // Create the minor version bump for development in a temporary merge/<original branch> on top of the release commit
        // ------------------------------------------------------------------------------------------------------------------
        let unreleased_branch: string | undefined;
        let allRepoState: string = "";
        if (versionBump !== "patch") {
            unreleased_branch = `merge/${this.originalBranchName}`
            console.log(`Creating bump ${versionBump} version for development in branch ${unreleased_branch}`)

            await this.gitRepo.createBranch(unreleased_branch);
            const minorRepoState = await this.bumpCurrentBranch(versionBump, serverNeedBump, packageNeedBump, oldVersions);
            allRepoState += `\n${minorRepoState}`;

            // switch package to pendingReleaseBranch
            await this.gitRepo.switchBranch(pendingReleaseBranch);
            this.repo.reload();
            this.generatorPackage.reload();
            this.templatePackage.reload();
        }

        // ------------------------------------------------------------------------------------------------------------------
        // Create the patch version bump for development in a temporary merge/<release version> on top fo the release commit
        // ------------------------------------------------------------------------------------------------------------------
        console.log(`Creating bump patch version for development in branch ${pendingReleaseBranch}`)
        // Do the patch version bump
        const patchRepoState = await this.bumpCurrentBranch("patch", serverNeedBump, packageNeedBump, oldVersions);
        allRepoState += `\n${patchRepoState}`;

        // ------------------------------------------------------------------------------------------------------------------
        // Print instruction
        // ------------------------------------------------------------------------------------------------------------------
        // TODO: automate this
        console.log(allRepoState);
        console.log("\nPush these tags in dependencies order and wait for the package to be generated between these tags");
        for (const tag of this.gitRepo.newTags) {
            console.log(`  ${tag}`);
        }

        console.log(`Then merge branch ${pendingReleaseBranch} into ${releaseBranch} and push`);
        if (unreleased_branch) {
            console.log(`And merge branch ${unreleased_branch} into ${this.originalBranchName} and push`);
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
    public async bumpDependencies(commitMessage: string, bumpDepClient: boolean, bumpDepServer: boolean, bumpDepPackages: Set<string>, release: boolean = false) {
        const bumpPackages = this.repo.packages.packages.filter(pkg => {
            if (bumpDepClient && pkg.monoRepo === this.repo.clientMonoRepo) {
                return true;
            }
            if (bumpDepServer && pkg.monoRepo === this.repo.serverMonoRepo) {
                return true;
            }
            if (bumpDepPackages.has(pkg.name)) {
                return true;
            }
            return false;
        });

        if (bumpPackages.length === 0) {
            fatal("ERROR: Unable to find dependencies to bump");
        }

        let changed = false;
        const bumpPackageMap = new Map<string, Package>(bumpPackages.map(pkg => [pkg.name, pkg]));
        for (const pkg of this.repo.packages.packages) {
            if (await BumpVersion.bumpPackageDependencies(pkg, bumpPackageMap, release)) {
                changed = true;
            }
        }

        if (changed) {
            // TODO: better commit message
            await this.gitRepo.commit(commitMessage, "bumping dependencies");
        }
    }

    public async cleanUp() {
        this.gitRepo.cleanUp(this.originalBranchName);
    }
};

/**
 * Load the repo and either do version bump or dependencies bump
 */
async function main() {
    versionCheck();

    const resolvedRoot = await getResolvedFluidRoot();
    const gitRepo = new GitRepo(resolvedRoot);
    const bv = new BumpVersion(gitRepo, await gitRepo.getCurrentBranchName());

    try {
        if (paramBumpDep) {
            return bv.bumpDependencies("Bump dependencies version", paramBumpDepClient, paramBumpDepServer, paramBumpDepPackages);
        }
        return bv.bumpVersion();
    } catch (e) {
        if (!e.fatal) { throw e; }
        console.error(e.message);
        bv.cleanUp().then(() => process.exit(-2));
    }
}

main().catch(e => {
    console.error("ERROR: unexpected error", JSON.stringify(e, undefined, 2))
    if (e.stack) {
        console.error(`Stack:\n${e.stack}`);
    }
});