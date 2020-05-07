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
import { GitRepo, fatal, exec, execNoError } from "./utils";
import * as os from "os";

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
const paramBumpDepPackages = new Map<string, string | undefined>();
let paramPush = true;
let paramPublishCheck = true;
let paramRelease = false;
let paramClean = false;
let paramCommit = false;

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
            const depArg = process.argv[++i];
            if (depArg === undefined) {
                console.error("ERROR: Missing arguments for --dep");
                process.exit(-1);
            }
            const split = depArg.split("=");
            const dep = split[0];
            const version = split[1];

            if (dep.toLowerCase() === MonoRepoKind[MonoRepoKind.Client].toLowerCase()) {
                paramBumpDepPackages.set(MonoRepoKind[MonoRepoKind.Client], version);
            } else if (dep.toLowerCase() === MonoRepoKind[MonoRepoKind.Server].toLowerCase()) {
                paramBumpDepPackages.set(MonoRepoKind[MonoRepoKind.Server], version);
            } else {
                paramBumpDepPackages.set(dep, version);
            }
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

        if (arg === "--local") {
            paramPush = false;
            paramPublishCheck = false;
            continue;
        }

        if (arg === "--test") {
            paramPush = false;
            // still do publish check assuming it is already published even when we don't push
            continue;
        }

        if (arg === "--cleanOnError") {
            paramClean = true;
            continue;
        }

        if (arg === "--commit") {
            paramCommit = true;
            continue;
        }

        if (arg === "--release") {
            paramRelease = true;
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
    private readonly newBranches: string[] = [];
    private readonly newTags: string[] = [];

    constructor(
        private readonly gitRepo: GitRepo,
        private readonly originalBranchName: string,
        private readonly remote: string,
    ) {
        this.timer = new Timer(commonOptions.timer);

        // Load the package
        this.repo = new FluidRepoBase(this.gitRepo.resolvedRoot);
        this.timer.time("Package scan completed");

        this.fullPackageMap = this.repo.createPackageMap();

        // TODO: Fold the generator package to the FluidRepoBase
        const generatorDir = path.join(this.gitRepo.resolvedRoot, "tools", "generator-fluid");
        this.generatorPackage = new Package(path.join(generatorDir, "package.json"));
        this.templatePackage = new Package(path.join(generatorDir, "app", "templates", "package.json"));
    }

    /**
     * Bump the dependencies of a package based on the what's in the packageMap, and save the package.json
     * 
     * @param pkg the package to bump dependency versions
     * @param bumpPackageMap the map of package that needs to bump
     * @param release use release or pre-release version in dependencies
     */
    private static async bumpPackageDependencies(pkg: Package, bumpPackageMap: Map<string, { pkg: Package, version: string }>, changedVersion?: VersionBag) {
        let changed = false;
        for (const { name, dev } of pkg.combinedDependencies) {
            const dep = bumpPackageMap.get(name);
            if (dep && !MonoRepo.isSame(dep.pkg.monoRepo, pkg.monoRepo)) {
                const depVersion = `^${dep.version}`;
                const dependencies = dev ? pkg.packageJson.devDependencies : pkg.packageJson.dependencies;
                if (dependencies[name] !== depVersion) {
                    if (changedVersion) {
                        BumpVersion.saveVersion(changedVersion, name, depVersion, dep.pkg.monoRepo);
                    }
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
            fatal(`Unrecognized branch '${branchName}'`);
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
                    if (semver.satisfies(`${depVersion}-0`, version)) {
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

        const bumpDepMap = new Map(this.repo.packages.packages.map(pkg => [pkg.name, { pkg, version: `${pkg.version}-0` }]));
        await BumpVersion.bumpPackageDependencies(this.templatePackage, bumpDepMap);
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

        let repoState = "";
        for (const name in newVersions) {
            if (!oldVersions || oldVersions[name] !== newVersions[name]) {
                repoState += `\n${name.padStart(40)}: ${oldVersions[name].padStart(10)} -> ${newVersions[name].padEnd(10)}`;
            } else {
                repoState += `\n${name.padStart(40)}: ${newVersions[name].padStart(10)} (unchanged)`;
            }
        }
        console.log(`  Committing version bump to ${newVersion} into ${currentBranchName}`);
        await this.gitRepo.commit(`Bump development version for clients to ${newVersion}\n${repoState}`, "create bumped version commit");
        return `Repo Versions in branch ${currentBranchName}:${repoState}`;
    }

    private async createBranch(branchName: string) {
        if (await this.gitRepo.getShaForBranch(branchName)) {
            fatal(`${branchName} already exists. Failed to create.`)
        }
        await this.gitRepo.createBranch(branchName);
        this.newBranches.push(branchName);
    }

    private async addTag(tag: string) {
        console.log(`    Tagging release ${tag}`);
        await this.gitRepo.addTag(tag);
        this.newTags.push(tag);
    }

    private async pushTag(tag: string) {
        if (paramPush) {
            while (!await this.prompt(`>>> Push tag ${tag} to remote?`)) {
                if (await this.prompt('>>> Abort?')) {
                    fatal("Operation stopped");
                }
            }
            return this.gitRepo.pushTag(tag, this.remote);
        } else {
            console.log(`    SKIPPED: pushing tag ${tag}`);
        }
    }

    /**
     * Check if a package is published
     * @param pkg package to check if it is published
     */
    private async checkPublished(pkg: Package) {
        const ret = await execNoError(`npm view ${pkg.name}@${pkg.version} version`, this.repo.resolvedRoot);
        if (!ret) { return false; }
        const publishedVersion = ret.split("\n")[0];
        return publishedVersion === pkg.version;
    }

    /**
     * Wait until a set of package has be published
     * @param packages array of packages to wait until it is published
     */
    private async ensureAllPublished(packages: Package[]) {
        // Wait for packages
        if (paramPublishCheck) {
            // Only non-private package would be published.
            let currPackages = packages.filter(pkg => !pkg.packageJson.private);
            const concurrency = os.cpus().length;
            const start = Date.now();
            let clearLineLength = 0;
            const sameLineWrite = (str: string) => {
                const outstr = str.padEnd(clearLineLength);
                clearLineLength = str.length;
                process.stdout.write(`\r${outstr}`);
            }
            while (currPackages.length) {
                // Check the first package every 5s.
                const pkg = currPackages[0];
                sameLineWrite(`    Waiting for package to publish ${pkg.name}@${pkg.version}...`);

                while (true) {
                    if (await this.checkPublished(pkg)) {
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    sameLineWrite(`    Waiting for package to publish ${pkg.name}@${pkg.version}...${((Date.now() - start) / 1000).toFixed(0)}s`);
                }
                currPackages = currPackages.slice(1);

                // Do parallel check to speed up
                sameLineWrite(`    Checking packages ${packages.length - currPackages.length}/${packages.length}`);
                while (currPackages.length) {
                    const checkSlice = currPackages.slice(0, concurrency);
                    const pendingSlice = currPackages.slice(concurrency);
                    const check =
                        await Promise.all(checkSlice.map(async pkg => { return { pkg, published: await this.checkPublished(pkg) } }));
                    const unpublished = check.filter(result => !result.published).map(result => result.pkg);
                    if (unpublished.length) {
                        // Go back to waiting one at a time if some package hasn't published yet
                        currPackages = unpublished.concat(pendingSlice);
                        break;
                    }
                    currPackages = pendingSlice;
                    sameLineWrite(`    Checking packages ${packages.length - currPackages.length}/${packages.length}`);
                }
            }
            sameLineWrite(`    ${packages.length} packages published`);
            console.log();
        } else {
            console.log("    SKIPPED: waiting for package to published");
        }
    }

    /**
     * Prompt the user for a yes/no answer.
     * 
     * @param message the message for the prompt
     */
    private async prompt(message: string) {
        return new Promise((resolve, reject) => {
            process.stdout.write(`${message} [y/n] `);
            process.stdin.setEncoding("utf8");
            if (process.stdin.setRawMode) {
                process.stdin.setRawMode(true);
            }
            const listener = (chunk: string) => {
                let cleanup: boolean = false;
                if (chunk[0] === "y") {
                    resolve(true);
                    console.log("y");
                    cleanup = true;
                }
                if (chunk[0] === "n") {
                    resolve(false);
                    console.log("n");
                    cleanup = true;
                }
                if (chunk.charCodeAt(0) === 3) {
                    reject(new Error("Ctrl-c abort"));
                    console.log();
                    cleanup = true;
                }
                if (cleanup) {
                    process.stdin.off('data', listener);
                    process.stdin.pause();
                    if (process.stdin.setRawMode) {
                        process.stdin.setRawMode(false);
                    }
                }
            };
            process.stdin.on('data', listener);
            process.stdin.resume();
        });
    }

    /**
     * Release a set of packages if needed
     * 
     * @param packageNeedBump all the package that needs to be release in this session
     * @param packages the package that to be released now if needed
     */
    private async releasePackage(packageNeedBump: Set<Package>, packages: string[]) {
        // Filter out the packages that need to be released
        const packageToBump: Package[] = [];
        const packageNeedBumpName = new Map<string, string | undefined>();
        for (const pkg of packageNeedBump) {
            if (packages.includes(pkg.name)) {
                packageToBump.push(pkg);
                packageNeedBumpName.set(pkg.name, undefined);
            }
        }

        if (packageToBump.length === 0) {
            return;
        }

        console.log(`  Releasing ${packages.join(" ")}`);

        // Tagging release
        for (const pkg of packageToBump) {
            if (!await this.checkPublished(pkg)) {
                let name = pkg.name.split("/").pop()!;
                if (name.startsWith("fluid-")) {
                    name = name.substring("fluid-".length);
                }
                const tagName = `${name}_v${pkg.version}`;
                await this.addTag(tagName);
                await this.pushTag(tagName);
            } else {
                // Resumed
                if (!await this.prompt(`>>> Package ${pkg.name}@${pkg.version} already published. Skip publish and bump version after?`)) {
                    fatal("Operation stopped.");
                }
            }
        }

        // Wait for packages
        await this.ensureAllPublished(packageToBump);

        // Fix the pre-release dependency and update package lock
        console.log("    Fix pre-release dependencies");
        const fixPrereleaseCommitMessage = `Remove pre-release dependencies for ${packageToBump.map(pkg => pkg.name).join(" ")}`;
        return this.bumpDependencies(fixPrereleaseCommitMessage, packageNeedBumpName, paramPublishCheck, true, true);
    }

    private async releaseMonoRepo(oldVersions: VersionBag, monoRepo: MonoRepo) {
        const kind = MonoRepoKind[monoRepo.kind];
        console.log(`  Releasing ${kind.toLowerCase()}`);

        if (!await this.checkPublished(monoRepo.packages[0])) {
            // Tagging release
            const oldVersion = oldVersions[kind];
            const tagName = `${kind.toLowerCase()}_v${oldVersion}`;
            await this.addTag(tagName);
            await this.pushTag(tagName);
        } else {
            // Resumed
            if (!await this.prompt(`>>> ${kind} already published. Skip publish and bump version after?`)) {
                fatal("Operation stopped.");
            }
        }

        await this.ensureAllPublished(monoRepo.packages);

        // Fix the pre-release dependency and update package lock
        console.log("    Fix pre-release dependencies");
        const fixPrereleaseCommitMessage = `Remove pre-release dependencies for ${kind.toLowerCase()}`;
        const bumpDep = new Map<string, string | undefined>();
        bumpDep.set(MonoRepoKind[monoRepo.kind], undefined)
        return this.bumpDependencies(fixPrereleaseCommitMessage, bumpDep, paramPublishCheck, true, true);
    }

    public async releaseGeneratorFluid() {
        // TODO: switch to detect package publish instead when the CI change the version scheme
        const tagName = `generator-fluid_v${this.generatorPackage.version}`;
        if (!await this.gitRepo.getShaForTag(tagName)) {
            await this.addTag(tagName);
            await this.pushTag(tagName);
        } else {
            // Resumed
            if (!await this.prompt(`>>> ${tagName} already exists. Skip publish and bump version after?`)) {
                fatal("Operation stopped.");
            }
        }

    }

    /**
     * Bump package version of the client monorepo
     * If it has dependencies to the current version of the other monorepo packages, bump package version of those too
     * 
     * If --commit or --release is specified, the bumpped version changes will be committed and a release branch will be created
     */
    public async bumpVersion() {
        const versionBump = await this.getVersionBumpKind();
        console.log(`Bumping ${versionBump} version`);

        const { serverNeedBump, packageNeedBump, oldVersions } = await this.collectionBumpInfo();

        // Make sure everything is installed
        await this.repo.install();

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
            const commit = await this.gitRepo.getShaForBranch(releaseBranch);
            if (commit) {
                const current = await this.gitRepo.getCurrentSha();
                if (current !== commit) {
                    fatal(`${releaseBranch} already exists`);
                }
                // Reuse the existing branch at the same commit
            } else {
                await this.createBranch(releaseBranch);
            }
        } else {
            releaseBranch = this.originalBranchName;
        }

        // ------------------------------------------------------------------------------------------------------------------
        // Create the release in a temporary merge/<release version>, fix pre-release dependency (if needed) and create tag.
        // ------------------------------------------------------------------------------------------------------------------
        console.log(`Creating release ${releaseVersion}`);

        const pendingReleaseBranch = `merge/${releaseVersion}`;
        console.log(`  Creating temporary release branch ${pendingReleaseBranch}`);
        const commit = await this.gitRepo.getShaForBranch(pendingReleaseBranch);
        if (commit) {
            if (!await this.prompt(`>>> Branch ${pendingReleaseBranch} exist, resume progress?`)) {
                fatal("Operation aborted");
            }
            await this.gitRepo.switchBranch(pendingReleaseBranch);
            this.repo.reload();
        } else {
            await this.createBranch(pendingReleaseBranch);
        }

        // TODO: Don't hard code order
        await this.releasePackage(packageNeedBump, ["@microsoft/eslint-config-fluid", "@microsoft/fluid-build-common"]);
        await this.releasePackage(packageNeedBump, ["@microsoft/fluid-common-definitions"]);
        await this.releasePackage(packageNeedBump, ["@microsoft/fluid-common-utils"]);
        if (serverNeedBump) {
            await this.releaseMonoRepo(oldVersions, this.repo.serverMonoRepo);
        }

        await this.releaseMonoRepo(oldVersions, this.repo.clientMonoRepo);
        await this.releaseGeneratorFluid();

        // ------------------------------------------------------------------------------------------------------------------
        // Create the minor version bump for development in a temporary merge/<original branch> on top of the release commit
        // ------------------------------------------------------------------------------------------------------------------
        let unreleased_branch: string | undefined;
        let allRepoState: string = "";
        if (versionBump !== "patch") {
            unreleased_branch = `merge/${this.originalBranchName}`
            console.log(`Creating bump ${versionBump} version for development in branch ${unreleased_branch}`)

            await this.createBranch(unreleased_branch);
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

        console.log("======================================================================================================");
        console.log(`Please merge ${pendingReleaseBranch} to ${releaseBranch}`);
        if (unreleased_branch) {
            console.log(`and merge ${unreleased_branch} to ${this.originalBranchName}`);
        }

        console.log(`Current repo state:`);
        console.log(allRepoState);
    }

    /**
     * Bump cross package/monorepo dependencies
     * 
     * Go all the packages in the repo and update the dependencies to the packages specified version to the one currently in the repo
     * 
     * @param repo the repo to operate one
     * @param bumpDepPackages update dependencies to these set of packages to current in repo version
     * @param updateLock whether to update the lock file (by npm i) or not
     * @param release make dependencies target release version instead of pre-release versions (e.g. ^0.16.0 vs ^0.16.0-0)
     */
    public async bumpDependencies(commitMessage: string, bumpDepPackages: Map<string, string | undefined>, updateLock: boolean, commit: boolean = false, release: boolean = false) {
        const suffix = release ? "" : "-0";
        const bumpPackages = this.repo.packages.packages.map(pkg => {
            const matchName = pkg.monoRepo ? MonoRepoKind[pkg.monoRepo.kind] : pkg.name;
            const matched = bumpDepPackages.has(matchName);
            // Only add the suffix if it is not user specified
            const version = bumpDepPackages.get(matchName) ?? `${pkg.version}${suffix}`;
            return { matched, pkg, version };
        }).filter(rec => rec.matched);
        if (bumpPackages.length === 0) {
            fatal("Unable to find dependencies to bump");
        }

        let changed = false;
        const updateLockPackage: Package[] = [];
        const bumpPackageMap = new Map(bumpPackages.map(rec => [rec.pkg.name, { pkg: rec.pkg, version: rec.version }]));
        const changedVersion: VersionBag = {};
        for (const pkg of this.repo.packages.packages) {
            if (await BumpVersion.bumpPackageDependencies(pkg, bumpPackageMap, changedVersion)) {
                updateLockPackage.push(pkg);
                changed = true;
            }
        }

        if (await BumpVersion.bumpPackageDependencies(this.templatePackage, bumpPackageMap, changedVersion)) {
            // Template package don't need to update lock
            changed = true;
        }

        if (changed) {
            if (updateLockPackage.length !== 0) {
                if (updateLock) {
                    // Fix package lock
                    await FluidRepoBase.ensureInstalled(updateLockPackage, false);
                } else {
                    console.log("    SKIPPED: updating lock file");
                }
            }

            let changedVersionString: string[] = [];
            for (const name in changedVersion) {
                changedVersionString.push(`${name.padStart(40)} -> ${changedVersion[name]}`);
            }
            const changedVersionMessage = changedVersionString.join("\n");
            if (commit) {
                await this.gitRepo.commit(`${commitMessage}\n\n${changedVersionMessage}`, "bump dependencies");
            }
            console.log(changedVersionMessage);
        } else {
            console.log("    No dependencies need to be updated");
        }
    }

    public async cleanUp() {
        if (paramClean) {
            await this.gitRepo.switchBranch(this.originalBranchName);
            for (const branch of this.newBranches) {
                await this.gitRepo.deleteBranch(branch);
            }
            for (const tag of this.newTags) {
                await this.gitRepo.deleteTag(tag);
            }
        }
    }
};

/**
 * Load the repo and either do version bump or dependencies bump
 */
async function main() {
    versionCheck();

    const resolvedRoot = await getResolvedFluidRoot();
    const gitRepo = new GitRepo(resolvedRoot);
    const remotes = await gitRepo.getRemotes();
    const url = "https://github.com/microsoft/fluidframework";
    let remote: string | undefined;
    for (const r of remotes) {
        if (r[1] && r[1].toLowerCase().startsWith(url)) {
            remote = r[0];
            break;
        }
    }
    if (!remote) {
        fatal(`Unable to find remote for ${url}`)
    }

    const bv = new BumpVersion(gitRepo, await gitRepo.getCurrentBranchName(), remote);

    try {
        if (paramBumpDepPackages.size) {
            if (paramRelease) {
                fatal("Conflicting switches --release and --dep");
            }
            console.log("Bumping dependencies");
            await bv.bumpDependencies("Bump dependencies version", paramBumpDepPackages, paramPublishCheck, paramCommit);
        } else if (paramRelease) {
            await bv.bumpVersion();
        } else {
            fatal("Missing flag --release or --dep");
        }
    } catch (e) {
        if (!e.fatal) { throw e; }
        console.error(`ERROR: ${e.message}`);
        await bv.cleanUp();
        process.exit(-2);
    }
}

main().catch(e => {
    console.error("ERROR: unexpected error", JSON.stringify(e, undefined, 2))
    if (e.stack) {
        console.error(`Stack:\n${e.stack}`);
    }
});