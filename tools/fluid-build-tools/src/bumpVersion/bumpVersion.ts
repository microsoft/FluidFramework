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
  -b --bump [<pkg>[=<type>]]     Bump the package version of specified package or monorepo (default: client)
  -d --dep [<pkg>[=<version>]]   Bump the dependencies version of specified package or monorepo (default: client)
  -r --release [<pkg>[=<type>]]  Release and bump version of specified package or monorepo and dependencies (default: client)
     --version [<pkg>[=<type>]]  Collect and show version of specified package or monorepo and dependencies (default: client)
${commonOptionString}
`);
}

type VersionBumpType = "minor" | "patch";
type VersionChangeType = VersionBumpType | semver.SemVer;


const paramBumpDepPackages = new Map<string, string | undefined>();
let paramPush = true;
let paramPublishCheck = true;
let paramReleaseName: string | undefined;
let paramReleaseVersion: VersionBumpType | undefined;
let paramClean = false;
let paramCommit = false;
let paramVersionName: string | undefined;
let paramVersion: semver.SemVer | undefined;
let paramBumpName: string | undefined;
let paramBumpVersion: VersionChangeType | undefined;

function parseNameVersion(arg: string | undefined) {
    let name = arg;
    let extra = false;

    if (name === undefined || name.startsWith("--")) {
        name = MonoRepoKind[MonoRepoKind.Client];
    } else {
        extra = true;
    }

    const split = name.split("=");
    name = split[0];
    let v = split[1];

    if (name.toLowerCase() === MonoRepoKind[MonoRepoKind.Client].toLowerCase()) {
        name = MonoRepoKind[MonoRepoKind.Client];
    } else if (name.toLowerCase() === MonoRepoKind[MonoRepoKind.Server].toLowerCase()) {
        name = MonoRepoKind[MonoRepoKind.Server];
    }

    let version: VersionChangeType | undefined;
    if (v !== undefined) {
        if (v === "minor" || v === "patch") {
            version = v;
        } else {
            const parsedVersion = semver.parse(v);
            if (!parsedVersion) {
                fatal(`Invalid version ${v}`);

            }
            version = parsedVersion;
        }
    }
    return { name, version, extra };
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

        if (arg === "-r" || arg === "--release") {
            if (paramReleaseName) {
                fatal("Can't do multiple release at once");
            }
            const { name, version, extra } = parseNameVersion(process.argv[i + 1]);

            paramReleaseName = name;

            if (version) {
                if (typeof version === "string") {
                    paramReleaseVersion = version;
                } else {
                    fatal(`Invalid version ${version} for flag --release`);
                }
            }

            if (extra) { i++; }
            continue;
        }

        if (arg === "--version") {
            if (paramVersionName) {
                fatal("Can't do multiple release at once");
            }
            const { name, version, extra } = parseNameVersion(process.argv[i + 1]);

            paramVersionName = name;
            if (version) {
                if (typeof version !== "string") {
                    paramVersion = version;
                } else {
                    fatal(`Invalid version ${version} for flag --version`);
                }
            }

            if (extra) { i++; }
            continue;
        }

        if (arg === "-b" || arg === "--bump") {
            if (paramBumpName) {
                fatal("Can't do multiple bump at once");
            }

            const { name, version, extra } = parseNameVersion(process.argv[i + 1]);

            paramBumpName = name;
            paramBumpVersion = version;
            if (extra) { i++; }
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

class VersionBag {
    private versionData: { [key: string]: string } = {};
    public add(pkg: Package, version: string) {
        const existing = this.internalAdd(pkg, version);
        if (existing) {
            fatal(`Inconsistent version for ${name} ${version} && ${existing}`);
        }
    }
    protected internalAdd(pkg: Package, version: string) {
        const entryName = VersionBag.getEntryName(pkg);
        const existing = this.versionData[entryName];
        if (existing) {
            if (existing !== version) {
                return existing;
            }
        } else {
            this.versionData[entryName] = version;
        }
    }
    public get(pkgOrMonoRepoName: Package | string) {
        let entryName = typeof pkgOrMonoRepoName === "string" ? pkgOrMonoRepoName : VersionBag.getEntryName(pkgOrMonoRepoName);
        return this.versionData[entryName];
    }
    public [Symbol.iterator]() {
        return Object.entries(this.versionData)[Symbol.iterator]();
    }

    protected static getEntryName(pkg: Package) {
        return pkg.monoRepo ? MonoRepoKind[pkg.monoRepo.kind] : pkg.name;
    }
}

/**
 * Keep track of all the dependency version information and detect conflicting dependencies.
 * Provide functionality to collect the dependencies information from published package as well.
 */
class ReferenceVersionBag extends VersionBag {
    private readonly referenceData = new Map<string, { reference: string, published: boolean }>();
    private readonly publishedPackage = new Set<string>();
    private readonly publishedPackageRange = new Set<string>();

    constructor(private readonly repoRoot: string, private readonly fullPackageMap: Map<string, Package>, public readonly repoVersions: VersionBag) {
        super();
    }

    /**
     * Add package and version to the version bag, with option reference to indicate where the reference comes from
     * Will error if there is a conflicting dependency versions, if the references are from the local repo, other wise warn.
     * 
     * @param pkg 
     * @param version 
     * @param newReference 
     */
    public add(pkg: Package, version: string, newReference?: string, published: boolean = false) {
        const existing = this.internalAdd(pkg, version);
        const entryName = VersionBag.getEntryName(pkg);
        if (existing) {
            const existingReference = this.referenceData.get(entryName);
            const message = `Inconsistent dependency to ${pkg.name}\n  ${version.padStart(10)} in ${newReference}\n  ${existing.padStart(10)} in ${existingReference?.reference}`;
            if (existingReference?.reference && this.publishedPackage.has(existingReference.reference) && newReference && this.publishedPackage.has(newReference)) {
                // only warn if the conflict is between two published references (since we can't change it anyways).
                console.warn(`WARNING: ${message}`);
            } else {
                fatal(message);
            }
        }
        if (newReference) {
            this.referenceData.set(entryName, { reference: newReference, published });
        }
    }

    private async getPublishedMatchingVersion(rangeSpec: string, reference: string | undefined) {
        const ret = await execNoError(`npm view "${rangeSpec}" version --json`, this.repoRoot);
        if (!ret) {
            if (reference) {
                fatal(`Unable to get published version for ${rangeSpec} referenced from ${reference}.`);
            }
            // If a reference is not given, we can just skip it if it doesn't exist
            return undefined;
        }
        let publishedVersions: string | string[];
        try {
            publishedVersions = JSON.parse(ret);
        } catch (e) {
            if (reference) {
                fatal(`Unable to parse published version for ${rangeSpec} referenced from ${reference}.\nOutput: ${ret}`);
            }
            // If a reference is not given, we can just skip it if it doesn't exist
            return undefined;
        }

        return Array.isArray(publishedVersions) ? publishedVersions.sort(semver.rcompare)[0] : publishedVersions;
    }

    private async getPublishedDependencies(versionSpec: string, dev: boolean) {

        const dep = dev ? "devDependencies" : "dependencies";
        const retDep = await exec(`npm view ${versionSpec} ${dep} --json`, this.repoRoot, "look up dependencies");
        // detect if there are no dependencies
        if (retDep.trim() === "") { return undefined; }

        try {
            return JSON.parse(retDep);
        } catch (e) {
            fatal(`Unable to parse dependencies for ${versionSpec}.\nOutput: ${retDep}`);
        }
    }

    /**
     * Given a package a version range, ask NPM for a list of version that satisfies it, and find the latest version.
     * That version is added to the version bag, and will error on conflict.
     * It then ask NPM for the list of dependency for the matched version, and collect the version as well.
     * 
     * @param pkg - the package to begin collection information
     * @param versionRange - the version range to match
     * @param repoRoot - where the repo root is
     * @param fullPackageMap - map of all the package in the repo
     * @param reference - reference of this dependency for error reporting in case of conflict
     */
    public async collectPublishedPackageDependencies(
        pkg: Package,
        versionRange: string,
        reference?: string
    ) {
        const pending = [{ pkg, versionRange, reference }];
        while (pending.length) {
            const { pkg, versionRange, reference } = pending.pop()!;

            const entryName = VersionBag.getEntryName(pkg);
            const rangeSpec = `${pkg.name}@${versionRange}`;

            // Check if we already checked this published package range
            if (this.publishedPackageRange.has(rangeSpec)) {
                continue;
            }

            this.publishedPackageRange.add(rangeSpec);

            let matchedVersion: string | undefined = this.get(entryName);
            if (!matchedVersion || !semver.satisfies(matchedVersion, versionRange)) {
                matchedVersion = await this.getPublishedMatchingVersion(rangeSpec, reference);
                if (!matchedVersion) {
                    continue;
                }
            }
            console.log(`    Found ${rangeSpec} => ${matchedVersion}`);
            this.add(pkg, matchedVersion, reference, true);

            // Get the dependencies
            const versionSpec = `${pkg.name}@${matchedVersion}`;
            if (this.publishedPackage.has(versionSpec)) {
                continue;
            }
            this.publishedPackage.add(versionSpec);
            const dep = {
                ...await this.getPublishedDependencies(versionSpec, true),
                ...await this.getPublishedDependencies(versionSpec, false),
            };

            // Add it to pending for processing
            for (const d in dep) {
                const depPkg = this.fullPackageMap.get(d);
                if (depPkg) {
                    pending.push({ pkg: depPkg, versionRange: dep[d], reference: versionSpec });
                }
            }
        }
    }

    public printRelease() {
        console.log("Release Versions:");
        for (const [name] of this.repoVersions) {
            const depVersion = this.get(name) ?? "undefined";
            const state = this.needRelease(name) ? "(new)" : this.needBump(name) ? "(current)" : "(old)";
            console.log(`${name.padStart(40)}: ${depVersion.padStart(10)} ${state}`);
        }
        console.log();
    }

    public printPublished(name: string) {
        console.log(`Current Versions from ${name}:`);
        for (const [name] of this.repoVersions) {
            const depVersion = this.get(name) ?? "undefined";
            console.log(`${name.padStart(40)}: ${depVersion.padStart(10)} ${depVersion === "undefined" ? "" : this.needRelease(name) ? "(local)" : "(published)"}`);
        }
        console.log();
    }

    public needBump(name: string) {
        return this.repoVersions.get(name) === this.get(name);
    }
    public needRelease(name: string) {
        if (this.needBump(name)) {
            const data = this.referenceData.get(name)!;
            return !data || !data.published;
        }
        return false;
    }
}

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
        this.repo = new FluidRepoBase(this.gitRepo.resolvedRoot, false);
        this.timer.time("Package scan completed");

        this.fullPackageMap = this.repo.createPackageMap();

        // TODO: Is there a way to generate this automatically?
        const generatorPackage = this.fullPackageMap.get("@microsoft/generator-fluid");
        if (!generatorPackage) { fatal("Unable to find @microsoft/generator-fluid package") };
        this.generatorPackage = generatorPackage;
        this.templatePackage = new Package(path.join(generatorPackage.directory, "app", "templates", "package.json"));
    }

    /**
     * Bump the dependencies of a package based on the what's in the packageMap, and save the package.json
     * 
     * @param pkg the package to bump dependency versions
     * @param bumpPackageMap the map of package that needs to bump
     * @param release if we are releasing, only patch the pre-release dependencies
     * @param changedVersion the version bag to collect version that is changed
     */
    private static async bumpPackageDependencies(
        pkg: Package,
        bumpPackageMap: Map<string, { pkg: Package, version: string }>,
        release: boolean,
        changedVersion?: VersionBag
    ) {
        let changed = false;
        for (const { name, dev } of pkg.combinedDependencies) {
            const dep = bumpPackageMap.get(name);
            if (dep && !MonoRepo.isSame(dep.pkg.monoRepo, pkg.monoRepo)) {
                const depVersion = `^${dep.version}`;
                const dependencies = dev ? pkg.packageJson.devDependencies : pkg.packageJson.dependencies;
                if (release ? dependencies[name] === `${depVersion}-0` : dependencies[name] !== depVersion) {
                    if (changedVersion) {
                        changedVersion.add(dep.pkg, depVersion);
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

    private async switchBranchAndReloadPackageJson(name: string) {
        await this.gitRepo.switchBranch(name);
        this.reloadPackageJson();
    }

    private reloadPackageJson() {
        this.repo.reload();
        this.templatePackage.reload();
    }

    /**
     * Collect the version of the packages in a VersionBag
     */
    private collectVersions() {
        const versions = new VersionBag();

        this.repo.packages.packages.forEach(pkg => {
            if (pkg.packageJson.private && pkg.monoRepo === undefined) {
                return;
            }
            versions.add(pkg, pkg.version);
        });

        versions.add(this.templatePackage, this.templatePackage.version);
        return versions;
    }

    /**
     * Determine either we want to bump minor on master or patch version on release/* based on branch name 
     */
    private async getVersionBumpKind(): Promise<VersionBumpType> {
        if (paramReleaseVersion !== undefined) {
            return paramReleaseVersion;
        }

        // Determine the kind of bump
        const branchName = this.originalBranchName;
        if (branchName !== "master" && !branchName!.startsWith("release/")) {
            fatal(`Unrecognized branch '${branchName}'`);
        }
        return branchName === "master" ? "minor" : "patch";
    }

    private async collectVersionInfo(releaseName: string) {
        console.log("  Resolving published dependencies");

        const depVersions = new ReferenceVersionBag(this.repo.resolvedRoot, this.fullPackageMap, this.collectVersions());
        const pendingDepCheck = [];
        const processMonoRepo = (monoRepo: MonoRepo) => {
            pendingDepCheck.push(...monoRepo.packages);
            // Fake these for printing.
            const firstClientPackage = monoRepo.packages[0];
            depVersions.add(firstClientPackage, firstClientPackage.version);
        };

        if (releaseName === MonoRepoKind[MonoRepoKind.Client]) {
            processMonoRepo(this.repo.clientMonoRepo);
        } else if (releaseName === MonoRepoKind[MonoRepoKind.Server]) {
            processMonoRepo(this.repo.serverMonoRepo);
        } else {
            const pkg = this.fullPackageMap.get(releaseName);
            if (!pkg) {
                fatal(`Can't find package ${releaseName} to release`);
            }
            pendingDepCheck.push(pkg);
            depVersions.add(pkg, pkg.version);
        }
        const collectVersionPromises = [];
        while (true) {
            const pkg = pendingDepCheck.pop();
            if (!pkg) {
                break;
            }
            if (pkg === this.generatorPackage) {
                pendingDepCheck.push(this.templatePackage);
            }
            for (const { name: dep, version } of pkg.combinedDependencies) {
                const depBuildPackage = this.fullPackageMap.get(dep);
                if (depBuildPackage) {
                    if (MonoRepo.isSame(pkg.monoRepo, depBuildPackage.monoRepo)) {
                        // If it is the same repo, there are all related, and we would have added them to the pendingDepCheck as a set already.
                        // Just verify that the two package has the same version and the dependency has the same version
                        if (pkg.version !== depBuildPackage.version) {
                            fatal(`Inconsistent package version within ${MonoRepoKind[pkg.monoRepo!.kind].toLowerCase()} monorepo\n   ${pkg.name}@${pkg.version}\n  ${dep}@${depBuildPackage.version}`);
                        }
                        if (version !== `^${depBuildPackage.version}`) {
                            fatal(`Inconsistent version dependency within ${MonoRepoKind[pkg.monoRepo!.kind].toLowerCase()} monorepo in ${pkg.name}\n  actual: ${dep}@${version}\n  expected: ${dep}@^${depBuildPackage.version}`);
                        }
                        continue;
                    }
                    let depVersion = depBuildPackage.version;
                    const reference = `${pkg.name}@local`;
                    if (semver.satisfies(`${depVersion}-0`, version)) {
                        if (!depVersions.get(depBuildPackage)) {
                            logVerbose(`${depBuildPackage.nameColored}: Add from ${pkg.nameColored} ${version}`);
                            if (depBuildPackage.monoRepo) {
                                pendingDepCheck.push(...depBuildPackage.monoRepo.packages);
                            } else {
                                pendingDepCheck.push(depBuildPackage);
                            }
                        }
                        depVersions.add(depBuildPackage, depVersion, reference);
                    } else {
                        collectVersionPromises.push(depVersions.collectPublishedPackageDependencies(depBuildPackage, version, reference));
                    }
                }
            }
        }
        await Promise.all(collectVersionPromises);

        return depVersions;
    }

    /**
     * Start with client and generator package marka as to be bumped, determine whether their dependent monorepo or packages 
     * has the same version to the current version in the repo and needs to be bumped as well
     */
    private async collectBumpInfo(releaseName: string) {
        const depVersions = await this.collectVersionInfo(releaseName);
        depVersions.printRelease();
        return depVersions;
    }

    public async showVersions(name: string, publishedVersion?: semver.SemVer) {
        let versions: ReferenceVersionBag;
        if (!publishedVersion) {
            versions = await this.collectVersionInfo(name);
        } else {
            const processMonoRepo = async (monoRepo: MonoRepo) => {
                await Promise.all(monoRepo.packages.map(pkg => {
                    return depVersions.collectPublishedPackageDependencies(pkg, publishedVersion.toString());
                }));
            };
            const depVersions = new ReferenceVersionBag(this.repo.resolvedRoot, this.fullPackageMap, this.collectVersions());
            let pkg: Package | undefined;
            if (name === MonoRepoKind[MonoRepoKind.Client]) {
                await processMonoRepo(this.repo.clientMonoRepo);
            } else if (name === MonoRepoKind[MonoRepoKind.Server]) {
                await processMonoRepo(this.repo.serverMonoRepo);
            } else {
                pkg = this.fullPackageMap.get(name);
                if (!pkg) {
                    fatal(`Package ${name} not in repo`);
                }
            }
            versions = depVersions;
        }

        versions.printPublished(name);
    }

    /**
     * Bump version of packages in the repo
     * 
     * @param versionBump the kind of version bump
     */
    private async bumpRepo(versionBump: VersionChangeType, clientNeedBump: boolean, serverNeedBump: boolean, packageNeedBump: Set<Package>) {
        const bumpMonoRepo = async (monoRepo: MonoRepo) => {
            return exec(`npx lerna version ${versionBump} --no-push --no-git-tag-version -y && npm run build:genver`, monoRepo.repoPath, "bump mono repo");
        }

        if (clientNeedBump) {
            console.log("  Bumping client version");
            await this.bumpLegacyDependencies(versionBump);
            await bumpMonoRepo(this.repo.clientMonoRepo);
        }

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
        this.reloadPackageJson();
        return this.collectVersions();
    }

    private async bumpLegacyDependencies(versionBump: VersionChangeType) {
        if (versionBump !== "patch") {
            // Assumes that we want N/N-1 testing
            const pkg = this.fullPackageMap.get("@fluid-internal/end-to-end-tests");
            if (!pkg) {
                fatal("Unable to find package @fluid-internal/end-to-end-tests");
            }
            for (const { name, version, dev } of pkg.combinedDependencies) {
                if (!version.startsWith("npm:")) {
                    continue;
                }

                const spec = version.substring(4);
                const split = spec.split("@");
                if (split.length <= 1) {
                    continue;
                }
                const range = split.pop();
                const packageName = split.join("@");
                const depPackage = this.fullPackageMap.get(packageName);
                if (depPackage) {
                    const dep = dev ? pkg.packageJson.devDependencies : pkg.packageJson.dependencies;

                    if (typeof versionBump === "string") {
                        dep[name] = `npm:${packageName}@^${depPackage.version}`;
                    } else {
                        dep[name] = `npm:${packageName}@^${versionBump.major}.${versionBump.minor - 1}.0}`;
                    }

                }
            }
            pkg.savePackageJson();
        }
    }

    private static getRepoStateChange(oldVersions: VersionBag, newVersions: VersionBag) {

        let repoState = "";
        for (const [name, newVersion] of newVersions) {
            const oldVersion = oldVersions.get(name) ?? "undefined";
            if (oldVersion !== newVersion) {
                repoState += `\n${name.padStart(40)}: ${oldVersion.padStart(10)} -> ${newVersion.padEnd(10)}`;
            } else {
                repoState += `\n${name.padStart(40)}: ${newVersion.padStart(10)} (unchanged)`;
            }
        }
        return repoState;
    }

    /**
     * Create a commit with the version bump and return the repo transition state 
     * 
     * @param versionBump the kind of version Bump
     * @param serverNeedBump whether server version needs to be bump
     * @param packageNeedBump the set of packages that needs to be bump
     * @param oldVersions old versions
     */
    private async bumpCurrentBranch(versionBump: VersionBumpType, releaseName: string, depVersions: ReferenceVersionBag) {
        let clientNeedBump = false;
        let serverNeedBump = false;
        const packageNeedBump = new Set<Package>();
        for (const [name] of depVersions) {
            if (depVersions.needBump(name)) {
                if (name === MonoRepoKind[MonoRepoKind.Client]) {
                    clientNeedBump = true;
                } else if (name === MonoRepoKind[MonoRepoKind.Server]) {
                    serverNeedBump = true;
                } else {
                    const pkg = this.fullPackageMap.get(name);
                    // the generator packages are not part of the full package map
                    if (pkg) {
                        packageNeedBump.add(pkg);
                    }
                }
            }
        }
        const newVersions = await this.bumpRepo(versionBump, clientNeedBump, serverNeedBump, packageNeedBump);
        const repoState = BumpVersion.getRepoStateChange(depVersions.repoVersions, newVersions);

        const releaseNewVersion = newVersions.get(releaseName);
        const currentBranchName = await this.gitRepo.getCurrentBranchName();
        console.log(`  Committing ${releaseName} version bump to ${releaseNewVersion} into ${currentBranchName}`);
        await this.gitRepo.commit(`Bump development version for ${releaseName} to ${releaseNewVersion}\n${repoState}`, "create bumped version commit");
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
        const ret = await execNoError(`npm view ${pkg.name}@${pkg.version} version --json`, this.repo.resolvedRoot);
        if (!ret) { return false; }
        try {
            const publishedVersion = JSON.parse(ret);
            return publishedVersion === pkg.version;
        } catch (e) {
            return false;
        }
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
    private async releasePackage(depVersions: ReferenceVersionBag, packages: string[]) {
        // Filter out the packages that need to be released
        const packageToBump: Package[] = [];
        const packageNeedBumpName = new Map<string, string | undefined>();
        for (const [name] of depVersions) {
            if (!depVersions.needRelease(name)) {
                continue;
            }
            if (packages.includes(name)) {
                packageToBump.push(this.fullPackageMap.get(name)!);
                packageNeedBumpName.set(name, undefined);
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

    private async releaseMonoRepo(depVersions: ReferenceVersionBag, monoRepo: MonoRepo) {
        if (!depVersions.needRelease(MonoRepoKind[monoRepo.kind])) {
            return;
        }
        const oldVersions = depVersions.repoVersions;
        const kind = MonoRepoKind[monoRepo.kind];
        console.log(`  Releasing ${kind.toLowerCase()}`);

        if (!await this.checkPublished(monoRepo.packages[0])) {
            // Tagging release
            const oldVersion = oldVersions.get(kind);
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
        bumpDep.set(kind, undefined);
        return this.bumpDependencies(fixPrereleaseCommitMessage, bumpDep, paramPublishCheck, true, true);
    }

    /**
     * Bump package version of the client monorepo
     * If it has dependencies to the current version of the other monorepo packages, bump package version of those too
     * 
     * If --commit or --release is specified, the bumpped version changes will be committed and a release branch will be created
     */
    public async releaseVersion(releaseName: string) {
        const versionBump = await this.getVersionBumpKind();
        if (versionBump !== "patch" && releaseName !== MonoRepoKind[MonoRepoKind.Client]) {
            fatal(`Can't do ${versionBump} release on '${releaseName.toLowerCase()}' packages, only patch release is allowed`);
        }

        console.log(`Bumping ${versionBump} version of ${releaseName.toLowerCase()}`);

        const depVersions = await this.collectBumpInfo(releaseName);

        // Make sure everything is installed
        if (!await this.repo.install()) {
            fatal("Install failed");
        }

        // -----------------------------------------------------------------------------------------------------
        // Create the release development branch if it is it not a patch upgrade
        // -----------------------------------------------------------------------------------------------------
        const releaseVersion = depVersions.repoVersions.get(releaseName);
        if (!releaseVersion) {
            fatal(`Missing ${releaseName} packages`);
        }
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
        console.log(`Creating ${releaseName} release ${releaseVersion}`);

        const pendingReleaseBranch = `merge/${releaseName}_v${releaseVersion}`;
        console.log(`  Creating temporary release branch ${pendingReleaseBranch}`);
        const commit = await this.gitRepo.getShaForBranch(pendingReleaseBranch);
        if (commit) {
            if (!await this.prompt(`>>> Branch ${pendingReleaseBranch} exist, resume progress?`)) {
                fatal("Operation aborted");
            }
            await this.switchBranchAndReloadPackageJson(pendingReleaseBranch);
        } else {
            await this.createBranch(pendingReleaseBranch);
        }

        // TODO: Don't hard code order
        await this.releasePackage(depVersions, ["@fluidframework/eslint-config-fluid", "@fluidframework/fluid-build-common"]);
        await this.releasePackage(depVersions, ["@fluidframework/common-definitions"]);
        await this.releasePackage(depVersions, ["@fluidframework/common-utils"]);
        await this.releaseMonoRepo(depVersions, this.repo.serverMonoRepo);
        await this.releaseMonoRepo(depVersions, this.repo.clientMonoRepo);
        await this.releasePackage(depVersions, ["@microsoft/generator-fluid", "tinylicious"]);

        // ------------------------------------------------------------------------------------------------------------------
        // Create the minor version bump for development in a temporary merge/<original branch> on top of the release commit
        // ------------------------------------------------------------------------------------------------------------------
        let unreleased_branch: string | undefined;
        let allRepoState: string = "";
        if (versionBump !== "patch") {
            unreleased_branch = `merge/${this.originalBranchName}`
            console.log(`Bumping ${versionBump} version for development in branch ${unreleased_branch}`)

            await this.createBranch(unreleased_branch);
            const minorRepoState = await this.bumpCurrentBranch(versionBump, releaseName, depVersions);
            allRepoState += `\n${minorRepoState}`;

            // switch package to pendingReleaseBranch
            await this.switchBranchAndReloadPackageJson(pendingReleaseBranch);

        }

        // ------------------------------------------------------------------------------------------------------------------
        // Create the patch version bump for development in a temporary merge/<release version> on top fo the release commit
        // ------------------------------------------------------------------------------------------------------------------
        console.log(`Bumping patch version for development in branch ${pendingReleaseBranch}`)
        // Do the patch version bump
        const patchRepoState = await this.bumpCurrentBranch("patch", releaseName, depVersions);
        allRepoState += `\n${patchRepoState}`;

        console.log("======================================================================================================");
        console.log(`Please merge ${pendingReleaseBranch} to ${releaseBranch}`);
        if (unreleased_branch) {
            console.log(`and merge ${unreleased_branch} to ${this.originalBranchName}`);
        }

        console.log(`Current repo state:`);
        console.log(allRepoState);
    }

    public async bumpVersion(name: string, version: VersionChangeType, commit: boolean) {
        console.log(`Bumping ${name} to ${version}`);

        let clientNeedBump = false;
        let serverNeedBump = false;
        let packageNeedBump = new Set<Package>();
        if (name === MonoRepoKind[MonoRepoKind.Client]) {
            clientNeedBump = true;
            const ret = await this.repo.clientMonoRepo.install();
            if (ret.error) {
                fatal("Install failed");
            }
        } else if (name === MonoRepoKind[MonoRepoKind.Server]) {
            serverNeedBump = true;
            const ret = await this.repo.serverMonoRepo.install();
            if (ret.error) {
                fatal("Install failed");
            }
        } else {
            const pkg = this.fullPackageMap.get(name);
            if (!pkg) {
                fatal(`Package ${name} not found. Unable to bump version`);
            }
            if (pkg.monoRepo) {
                fatal(`Monorepo package can't be bump individually`);
            }
            packageNeedBump.add(pkg);
            const ret = await pkg.install();
            if (ret.error) {
                fatal("Install failed");
            }
        }

        const oldVersions = this.collectVersions();
        const newVersions = await this.bumpRepo(version, clientNeedBump, serverNeedBump, packageNeedBump);
        const bumpRepoState = BumpVersion.getRepoStateChange(oldVersions, newVersions);
        console.log(bumpRepoState);
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
        const changedVersion = new VersionBag();
        for (const pkg of this.repo.packages.packages) {
            if (await BumpVersion.bumpPackageDependencies(pkg, bumpPackageMap, release, changedVersion)) {
                updateLockPackage.push(pkg);
                changed = true;
            }
        }

        if (await BumpVersion.bumpPackageDependencies(this.templatePackage, bumpPackageMap, release, changedVersion)) {
            // Template package don't need to update lock
            changed = true;
        }

        if (changed) {
            if (updateLockPackage.length !== 0) {
                if (updateLock) {
                    // Fix package lock
                    if (!await FluidRepoBase.ensureInstalled(updateLockPackage, false)) {
                        fatal("Install Failed");
                    }
                } else {
                    console.log("      SKIPPED: updating lock file");
                }
            }

            let changedVersionString: string[] = [];
            for (const [name, version] of changedVersion) {
                changedVersionString.push(`${name.padStart(40)} -> ${version}`);
            }
            const changedVersionMessage = changedVersionString.join("\n");
            if (commit) {
                await this.gitRepo.commit(`${commitMessage}\n\n${changedVersionMessage}`, "bump dependencies");
            }
            console.log(`      ${commitMessage}`);
            console.log(changedVersionMessage);
        } else {
            console.log("      No dependencies need to be updated");
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
    parseOptions(process.argv);
    const resolvedRoot = await getResolvedFluidRoot();
    console.log(`Repo: ${resolvedRoot}`);
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
            if (paramReleaseName) {
                fatal("Conflicting switches --release and --dep");
            }
            if (paramVersionName) {
                fatal("Conflicting switches --version and --dep");
            }
            if (paramBumpName) {
                fatal("Conflicting switches --bump and --dep");
            }
            console.log("Bumping dependencies");
            await bv.bumpDependencies("Bump dependencies version", paramBumpDepPackages, paramPublishCheck, paramCommit);
        } else if (paramReleaseName) {
            if (paramVersionName) {
                fatal("Conflicting switches --release and --version");
            }
            if (paramBumpName) {
                fatal("Conflicting switches --release and --bump");
            }
            await bv.releaseVersion(paramReleaseName);
        } else if (paramVersionName) {
            if (paramBumpName) {
                fatal("Conflicting switches --version and --bump");
            }
            await bv.showVersions(paramVersionName, paramVersion);
        } else if (paramBumpName) {
            await bv.bumpVersion(paramBumpName, paramBumpVersion ?? "patch", paramCommit);
        } else {
            fatal("Missing command flags --release/--dep/--bump/--version");
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