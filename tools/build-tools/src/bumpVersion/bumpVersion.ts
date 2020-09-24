/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */


import * as path from "path";
import { commonOptions, commonOptionString, parseOption } from "../common/commonOptions";
import { Timer } from "../common/timer";
import { getResolvedFluidRoot, getPackageManifest } from "../common/fluidUtils";
import { FluidRepo, IPackageManifest } from "../common/fluidRepo";
import { MonoRepo, MonoRepoKind } from "../common/monoRepo";
import * as semver from "semver";
import { Package } from "../common/npmPackage";
import { logVerbose } from "../common/logging";
import { GitRepo, fatal, exec, execNoError } from "./utils";
import * as os from "os";
import { assert } from "console";

function printUsage() {
    console.log(
        `
Usage: fluid-bump-version <options>
Options:
     --branch                    Create release branch and bump the version that would be released on main branch
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
let paramBranch = false;
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

        if (arg === "--branch") {
            paramBranch = true;
            paramClean = true;
            break;
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
    protected internalAdd(pkg: Package, version: string, override: boolean = false) {
        const entryName = VersionBag.getEntryName(pkg);
        const existing = this.versionData[entryName];
        if (existing !== version) {
            if (existing) {
                if (!override) {
                    return existing;
                }
                console.log(`    Overriding ${entryName} ${existing} -> ${version}`);
            }
            this.versionData[entryName] = version;
            return existing;
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
    private readonly nonDevDep = new Set<string>();
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
    public add(pkg: Package, version: string, dev: boolean = false, newReference?: string, published: boolean = false) {
        const entryName = VersionBag.getEntryName(pkg);
        // Override existing we haven't seen a non-dev dependency yet, and it is not a published version or it is not a dev dependency
        const override = !this.nonDevDep.has(entryName) && (!published || !dev);
        const existing = this.internalAdd(pkg, version, override);

        if (!dev) {
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
            this.nonDevDep.add(entryName);
        } else if (existing) {
            console.log(`      Ignored mismatched dev dependency ${pkg.name}@${version} vs ${existing}`);
            // Don't replace the existing reference if it is an ignored dev dependency
            return;
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

    public static checkPrivate(pkg: Package, dep: Package, dev: boolean) {
        if (dep.packageJson.private) {
            if (!pkg.packageJson.private && !dev) {
                fatal(`Private package not a dev dependency\n   ${pkg.name}@${pkg.version}\n  ${dep.name}@${dep.version}`)
            }
            if (!MonoRepo.isSame(pkg.monoRepo, dep.monoRepo)) {
                fatal(`Private package not in the same monorepo\n   ${pkg.name}@${pkg.version}\n  ${dep.name}@${dep.version}`)
            }
            return true;
        }
        return false;
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
        dev: boolean,
        reference?: string
    ) {
        const entryName = VersionBag.getEntryName(pkg);
        const rangeSpec = `${pkg.name}@${versionRange}`;

        // Check if we already checked this published package range
        if (this.publishedPackageRange.has(rangeSpec)) {
            return;
        }

        this.publishedPackageRange.add(rangeSpec);

        let matchedVersion: string | undefined = this.get(entryName);
        if (!matchedVersion || !semver.satisfies(matchedVersion, versionRange)) {
            matchedVersion = await this.getPublishedMatchingVersion(rangeSpec, reference);
            if (!matchedVersion) {
                return;
            }
        }
        console.log(`    Found ${rangeSpec} => ${matchedVersion}`);
        this.add(pkg, matchedVersion, dev, reference, true);

        // Get the dependencies
        const versionSpec = `${pkg.name}@${matchedVersion}`;
        if (this.publishedPackage.has(versionSpec)) {
            return;
        }
        this.publishedPackage.add(versionSpec);

        const pending: Promise<void>[] = [];
        const addPublishedDependencies = async (dev: boolean) => {
            const dep = await this.getPublishedDependencies(versionSpec, dev);
            // Add it to pending for processing
            for (const d in dep) {
                const depPkg = this.fullPackageMap.get(d);
                if (depPkg) {
                    if (ReferenceVersionBag.checkPrivate(pkg, depPkg, dev)) {
                        continue;
                    }
                    pending.push(this.collectPublishedPackageDependencies(depPkg, dep[d], dev, versionSpec));
                }
            }
        }
        await Promise.all([addPublishedDependencies(true), addPublishedDependencies(false)]);
        await Promise.all(pending);
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
    private readonly repo: FluidRepo;
    private readonly fullPackageMap: Map<string, Package>;
    private readonly generatorPackage: Package;
    private readonly templatePackage: Package;
    private readonly packageManifest: IPackageManifest;
    private readonly newBranches: string[] = [];
    private readonly newTags: string[] = [];

    constructor(
        private readonly gitRepo: GitRepo,
        private readonly originalBranchName: string,
        private readonly remote: string,
    ) {
        this.timer = new Timer(commonOptions.timer);

        // Load the package
        this.repo = new FluidRepo(this.gitRepo.resolvedRoot, false);
        this.timer.time("Package scan completed");

        this.fullPackageMap = this.repo.createPackageMap();
        this.packageManifest = getPackageManifest(this.repo.resolvedRoot);

        // TODO: Is there a way to generate this automatically?
        if (!this.packageManifest.generatorName) { fatal(`Unable to find generator package name in package.json`) }
        const generatorPackage = this.fullPackageMap.get(this.packageManifest.generatorName);
        if (!generatorPackage) { fatal(`Unable to find ${this.packageManifest.generatorName} package`) };
        this.generatorPackage = generatorPackage;
        this.templatePackage = new Package(path.join(generatorPackage.directory, "app", "templates", "package.json"), "tools");
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
     * Determine either we want to bump minor on main or patch version on release/* based on branch name
     */
    private async getVersionBumpKind(): Promise<VersionBumpType> {
        if (paramReleaseVersion !== undefined) {
            return paramReleaseVersion;
        }

        // Determine the kind of bump
        const branchName = this.originalBranchName;
        if (branchName !== "main" && !branchName!.startsWith("release/")) {
            fatal(`Unrecognized branch '${branchName}'`);
        }
        return branchName === "main" ? "minor" : "patch";
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
            assert(this.repo.serverMonoRepo, "Attempted to collect server info on a Fluid repo with no server directory");
            processMonoRepo(this.repo.serverMonoRepo!);
        } else {
            const pkg = this.fullPackageMap.get(releaseName);
            if (!pkg) {
                fatal(`Can't find package ${releaseName} to release`);
            }
            pendingDepCheck.push(pkg);
            depVersions.add(pkg, pkg.version);
        }

        const publishedPackageDependenciesPromises: Promise<void>[] = [];
        while (true) {
            const pkg = pendingDepCheck.pop();
            if (!pkg) {
                break;
            }
            if (pkg === this.generatorPackage) {
                pendingDepCheck.push(this.templatePackage);
            }
            for (const { name: dep, version, dev } of pkg.combinedDependencies) {
                const depBuildPackage = this.fullPackageMap.get(dep);
                if (depBuildPackage) {
                    if (ReferenceVersionBag.checkPrivate(pkg, depBuildPackage, dev)) {
                        continue;
                    }

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
                        depVersions.add(depBuildPackage, depVersion, dev, reference);
                    } else {
                        publishedPackageDependenciesPromises.push(depVersions.collectPublishedPackageDependencies(depBuildPackage, version, dev, reference));
                    }
                }
            }
        }
        await Promise.all(publishedPackageDependenciesPromises);

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
                    return depVersions.collectPublishedPackageDependencies(pkg, publishedVersion.toString(), false)
                }));
            };
            const depVersions = new ReferenceVersionBag(this.repo.resolvedRoot, this.fullPackageMap, this.collectVersions());
            let pkg: Package | undefined;
            if (name === MonoRepoKind[MonoRepoKind.Client]) {
                await processMonoRepo(this.repo.clientMonoRepo);
            } else if (name === MonoRepoKind[MonoRepoKind.Server]) {
                assert(this.repo.serverMonoRepo, "Attempted show server versions on a Fluid repo with no server directory");
                await processMonoRepo(this.repo.serverMonoRepo!);
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
            assert(this.repo.serverMonoRepo, "Attempted server version bump on a Fluid repo with no server directory");
            await bumpMonoRepo(this.repo.serverMonoRepo!);
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
                        dep[name] = `npm:${packageName}@^${semver.major(depPackage.version)}.${semver.minor(depPackage.version) - 1}.0`;
                    } else {
                        dep[name] = `npm:${packageName}@^${versionBump.major}.${versionBump.minor - 2}.0}`;
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
        await this.gitRepo.commit(`[bump] package version to ${releaseNewVersion} for development after ${releaseName.toLowerCase()} release\n${repoState}`, "create bumped version commit");
        return `Repo Versions in branch ${currentBranchName}:${repoState}`;
    }

    private async createBranch(branchName: string) {
        if (await this.gitRepo.getShaForBranch(branchName)) {
            fatal(`${branchName} already exists. Failed to create.`)
        }
        await this.gitRepo.createBranch(branchName);
        this.newBranches.push(branchName);
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
     * Create release branch based on the repo state, bump minor version immediately
     * and push it to `main` and the new release branch to remote
     */
    public async createReleaseBranch() {
        // Create release branch based on client version
        const releaseName = MonoRepoKind[MonoRepoKind.Client];

        const depVersions = await this.collectBumpInfo(releaseName);
        const releaseVersion = depVersions.repoVersions.get(releaseName);
        if (!releaseVersion) {
            fatal(`Missing ${releaseName} packages`);
        }

        // creating the release branch and bump the version
        const releaseBranchVersion = `${semver.major(releaseVersion)}.${semver.minor(releaseVersion)}`;
        const releaseBranch = `release/${releaseBranchVersion}`;
        const commit = await this.gitRepo.getShaForBranch(releaseBranch);
        if (commit) {
            fatal(`${releaseBranch} already exists`);
        }

        const bumpBranch = `minor_bump_${releaseBranchVersion}_${Date.now()}`;
        console.log(`Creating branch ${bumpBranch}`);

        await this.createBranch(bumpBranch);

        // Make sure everything is installed (so that we can do build:genver)
        if (!await this.repo.install()) {
            fatal("Install failed");
        }

        // Bump the version
        console.log(`Bumping minor version for development`)
        console.log(await this.bumpCurrentBranch("minor", releaseName, depVersions));

        console.log("======================================================================================================");
        console.log(`Please create PR for branch ${bumpBranch} targeting ${this.originalBranchName}`);
        console.log(`After PR is merged, create branch ${releaseBranch} one commit before the merged PR and push to the repo.`);
        console.log(`Then --release can be use to start the release.`);
    }

    private async postRelease(tagNames: string, packageNames: string, bumpDep: Map<string, string | undefined>) {
        console.log(`Tag ${tagNames} exists.`);
        console.log(`Bump version and update dependency for ${packageNames}`);
        // TODO: Ensure all published

        // Create branch
        const bumpBranch = `patch_bump_${Date.now()}`;
        await this.createBranch(bumpBranch);

        // Fix the pre-release dependency and update package lock
        const fixPrereleaseCommitMessage = `Also remove pre-release dependencies for ${packageNames}`;
        const message = await this.bumpDependencies(fixPrereleaseCommitMessage, bumpDep, paramPublishCheck, false, true);
        await this.bumpVersion([...bumpDep.keys()], "patch", packageNames, message?
            `\n\n${fixPrereleaseCommitMessage}\n${message}`: "");

        console.log("======================================================================================================");
        console.log(`Please create PR for branch ${bumpBranch} targeting ${this.originalBranchName}`);
        console.log(`After PR is merged run --release list the next release`);
    }

    public static getPackageShortName(pkgName: string) {
        let name = pkgName.split("/").pop()!;
        if (name.startsWith("fluid-")) {
            name = name.substring("fluid-".length);
        }
        return name;
    }

    /**
     * Release a set of packages
     */
    private async releasePackages(packages: Package[]) {
        await this.gitRepo.fetchTags();
        const packageShortName: string[] = [];
        const packageTags: string[] = [];
        const packageNeedBump = new Map<string, string | undefined>();
        const packageToRelease: Package[] = [];

        for (const pkg of packages) {
            const name = BumpVersion.getPackageShortName(pkg.name);
            const tagName = `${name}_v${pkg.version}`;
            packageShortName.push(name);
            packageTags.push(tagName);
            if ((await this.gitRepo.getTags(tagName)).trim() !== tagName) {
                packageToRelease.push(pkg);
            } else {
                packageNeedBump.set(pkg.name, undefined);
            }
        }

        if (packageToRelease.length !== 0) {
            console.log("======================================================================================================");
            console.log(`Please manually queue a release build for the following packages in ADO for branch ${this.originalBranchName}`);
            for (const pkg of packageToRelease) {
                console.log(`  ${pkg.name}`);
            }
            console.log(`After the build is done successfully run --release again to bump version and update dependency`);
            return;
        }

        const pkgBumpString = packageShortName.join(" ");
        return this.postRelease(packageTags.join(" "), pkgBumpString, packageNeedBump)
    }

    private async releaseMonoRepo(monoRepo: MonoRepo) {
        const kind = MonoRepoKind[monoRepo.kind];
        const kindLowerCase = MonoRepoKind[monoRepo.kind].toLowerCase();
        const tagName = `${kindLowerCase}_${monoRepo.version}`;
        await this.gitRepo.fetchTags();
        if ((await this.gitRepo.getTags(tagName)).trim() !== tagName) {
            console.log("======================================================================================================");
            console.log(`Please manually queue a release build for the following packages in ADO for branch ${this.originalBranchName}`);
            console.log(`  ${kindLowerCase}`);
            console.log(`After the build is done successfully run --release again to bump version and update dependency`);
            return;
        }
        const bumpDep = new Map<string, string | undefined>();
        bumpDep.set(kind, undefined);
        return this.postRelease(tagName, kindLowerCase, bumpDep);
    }

    /**
     * Bump package version of the client monorepo
     * If it has dependencies to the current version of the other monorepo packages, bump package version of those too
     *
     * If --commit or --release is specified, the bumpped version changes will be committed and a release branch will be created
     */
    public async releaseVersion(releaseName: string) {
        const versionBump = await this.getVersionBumpKind();
        if (versionBump !== "patch") {
            fatal(`Can't do ${versionBump} release on '${releaseName.toLowerCase()}' packages, only patch release is allowed`);
        }

        const depVersions = await this.collectBumpInfo(releaseName);

        let releaseGroup: string | undefined;
        let releasePackages: Package[] = [];
        let releaseMonoRepo: MonoRepo | undefined;
        // Assumes that the packages are in dependency order already.
        for (const [name] of depVersions.repoVersions) {
            if (depVersions.needRelease(name)) {
                if (releaseGroup) {
                    const pkg = this.fullPackageMap.get(name);
                    if (pkg && pkg.name === releaseGroup) {
                        releasePackages.push(pkg);
                    }
                } else {
                    if (name === MonoRepoKind[MonoRepoKind.Client]) {
                        releaseMonoRepo = this.repo.clientMonoRepo;
                        break;
                    }
                    if (name === MonoRepoKind[MonoRepoKind.Server]) {
                        releaseMonoRepo = this.repo.serverMonoRepo;
                        break;
                    }
                    const pkg = this.fullPackageMap.get(name);
                    if (!pkg) {
                        fatal(`Unable find package ${name}`);
                    }
                    releaseGroup = pkg.group;
                    releasePackages.push(pkg);
                }
            }
        }

        if (!releaseMonoRepo && releasePackages.length === 0) {
            fatal("Nothing to release");
        }

        if (releaseMonoRepo) {
            return this.releaseMonoRepo(releaseMonoRepo);
        }
        return this.releasePackages(releasePackages);
    }

    public async bumpVersion(bump: string[], version: VersionChangeType, packageShortNames: string, commit?: string) {
        console.log(`Bumping ${packageShortNames} to ${version}`);

        let clientNeedBump = false;
        let serverNeedBump = false;
        let packageNeedBump = new Set<Package>();
        for (const name of bump) {
            if (name === MonoRepoKind[MonoRepoKind.Client]) {
                clientNeedBump = true;
                const ret = await this.repo.clientMonoRepo.install();
                if (ret.error) {
                    fatal("Install failed");
                }
            } else if (name === MonoRepoKind[MonoRepoKind.Server]) {
                serverNeedBump = true;
                assert(this.repo.serverMonoRepo, "Attempted to bump server version on a Fluid repo with no server directory");
                const ret = await this.repo.serverMonoRepo!.install();
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
        }

        const oldVersions = this.collectVersions();
        const newVersions = await this.bumpRepo(version, clientNeedBump, serverNeedBump, packageNeedBump);
        const bumpRepoState = BumpVersion.getRepoStateChange(oldVersions, newVersions);
        console.log(bumpRepoState);

        if (commit !== undefined) {
            await this.gitRepo.commit(`[bump] package version for ${packageShortNames}\n${bumpRepoState}${commit}`, "create bumped version commit");
        }
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
                    if (!await FluidRepo.ensureInstalled(updateLockPackage, false)) {
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

            return changedVersionMessage;
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
    const url = "github.com/microsoft/fluidframework";
    let remote: string | undefined;
    for (const r of remotes) {
        if (r[1] && r[1].toLowerCase().includes(url)) {
            remote = r[0];
            break;
        }
    }
    if (!remote) {
        fatal(`Unable to find remote for ${url}`)
    }

    const bv = new BumpVersion(gitRepo, await gitRepo.getCurrentBranchName(), remote);

    try {
        if (paramBranch) {
            if (paramBumpDepPackages.size) {
                fatal("Conflicting switches --dep and --branch");
            }
            if (paramReleaseName) {
                fatal("Conflicting switches --release and --branch");
            }
            if (paramVersionName) {
                fatal("Conflicting switches --version and --branch");
            }
            if (paramBumpName) {
                fatal("Conflicting switches --bump and --branch");
            }
            await bv.createReleaseBranch();
        } else if (paramBumpDepPackages.size) {
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
            await bv.bumpVersion([paramBumpName], paramBumpVersion ?? "patch", BumpVersion.getPackageShortName(paramBumpName), paramCommit? "" : undefined);
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
