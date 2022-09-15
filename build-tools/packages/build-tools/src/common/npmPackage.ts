/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { queue } from "async";
import * as chalk from "chalk";
import * as fs from "fs";
import { hasMagic, sync as globSync } from "glob";
import * as path from "path";
import sortPackageJson from "sort-package-json";
import { defaultLogger } from "./logging";
import {
    copyFileAsync,
    execWithErrorAsync,
    rimrafWithErrorAsync,
    unlinkAsync,
    writeFileAsync,
    ExecAsyncResult,
    readJsonSync,
    existsSync,
    lookUpDirSync,
    isSameFileOrDir,
} from "./utils"
import { MonoRepo, MonoRepoKind } from "./monoRepo";
import { options } from "../fluidBuild/options";

const {info, verbose} = defaultLogger;
export type ScriptDependencies = { [key: string]: string[] };

interface IPerson {
    name: string;
    email: string;
    url: string;
}

interface IPackage {
    name: string;
    version: string;
    private: boolean;
    description: string;
    keywords: string[];
    homepage: string;
    bugs: { url: string; email: string };
    license: string;
    author: IPerson;
    contributors: IPerson[];
    files: string[];
    main: string;
    // Same as main but for browser based clients (check if webpack supports this)
    browser: string;
    bin: { [key: string]: string };
    man: string | string[];
    repository: string | { type: string; url: string };
    scripts: { [key: string]: string | undefined };
    config: { [key: string]: string };
    dependencies: { [key: string]: string };
    devDependencies: { [key: string]: string };
    peerDependencies: { [key: string]: string };
    bundledDependencies: { [key: string]: string };
    optionalDependencies: { [key: string]: string };
    engines: { node: string; npm: string };
    os: string[];
    cpu: string[];
    [key: string]: any;

    fluidBuild?: {
        buildDependencies: {
            merge?: {
                [key: string]: ScriptDependencies
            }
        }
    };
}

export class Package {
    private static packageCount: number = 0;
    private static readonly chalkColor = [
        chalk.default.red,
        chalk.default.green,
        chalk.default.yellow,
        chalk.default.blue,
        chalk.default.magenta,
        chalk.default.cyan,
        chalk.default.white,
        chalk.default.grey,
        chalk.default.redBright,
        chalk.default.greenBright,
        chalk.default.yellowBright,
        chalk.default.blueBright,
        chalk.default.magentaBright,
        chalk.default.cyanBright,
        chalk.default.whiteBright,
    ];

    public get packageJson(): IPackage {
        return this._packageJson;
    }
    private readonly packageId = Package.packageCount++;
    private _matched: boolean = false;
    private _markForBuild: boolean = false;

    private _packageJson: IPackage;

    constructor(private readonly packageJsonFileName: string, public readonly group: string, public readonly monoRepo?: MonoRepo) {
        this._packageJson = readJsonSync(packageJsonFileName);
        verbose(`Package Loaded: ${this.nameColored}`);
    }

    public get name(): string {
        return this.packageJson.name;
    }

    public get nameColored(): string {
        return this.color(this.name);
    }

    public get version(): string {
        return this.packageJson.version;
    }

    public get isPublished(): boolean {
        return !this.packageJson.private;
    }

    public get isTestPackage(): boolean {
        return this.name.split("/")[1]?.startsWith("test-") === true;
    }
    public get matched() {
        return this._matched;
    }

    public setMatched() {
        this._matched = true;
        this._markForBuild = true;
    }

    public get markForBuild() {
        return this._markForBuild;
    }

    public setMarkForBuild() {
        this._markForBuild = true;
    }

    public get dependencies() {
        return Object.keys(this.packageJson.dependencies ?? {});
    }

    public get combinedDependencies() {
        const it = function*(packageJson: IPackage) {
            for (const item in packageJson.dependencies) {
                yield ({ name: item, version: packageJson.dependencies[item], dev: false });
            }
            for (const item in packageJson.devDependencies) {
                yield ({ name: item, version: packageJson.devDependencies[item], dev: true });
            }
        }
        return it(this.packageJson);
    }

    public get directory(): string {
        return path.dirname(this.packageJsonFileName);
    }

    private get color() {
        return Package.chalkColor[this.packageId % Package.chalkColor.length];
    }

    public getScript(name: string): string | undefined {
        return this.packageJson.scripts ? this.packageJson.scripts[name] : undefined;
    }

    public async cleanNodeModules() {
        return rimrafWithErrorAsync(path.join(this.directory, "node_modules"), this.nameColored);
    }

    public async savePackageJson() {
        return writeFileAsync(this.packageJsonFileName, `${JSON.stringify(sortPackageJson(this.packageJson), undefined, 2)}\n`);
    }

    public reload() {
        this._packageJson = readJsonSync(this.packageJsonFileName);
    }

    public async noHoistInstall(repoRoot: string) {
        // Fluid specific
        const rootNpmRC = path.join(repoRoot, ".npmrc")
        const npmRC = path.join(this.directory, ".npmrc");
        const npmCommand = "npm i --no-package-lock --no-shrinkwrap";

        await copyFileAsync(rootNpmRC, npmRC);
        const result = await execWithErrorAsync(npmCommand, { cwd: this.directory }, this.nameColored);
        await unlinkAsync(npmRC);

        return result;
    }

    public async checkInstall(print: boolean = true) {
        if (this.combinedDependencies.next().done) {
            // No dependencies
            return true;
        }
        if (!existsSync(path.join(this.directory, "node_modules"))) {
            if (print) {
                console.error(`${this.nameColored}: node_modules not installed`);
            }
            return false;
        }
        let succeeded = true;
        for (const dep of this.combinedDependencies) {
            if (!lookUpDirSync(this.directory, (currentDir) => {
                // TODO: check semver as well
                return existsSync(path.join(currentDir, "node_modules", dep.name));
            })) {
                succeeded = false;
                if (print) {
                    console.error(`${this.nameColored}: dependency ${dep.name} not found`);
                }
            }
        }
        return succeeded;
    }

    public async install() {
        if (this.monoRepo) { throw new Error("Package in a monorepo shouldn't be installed"); }
        console.log(`${this.nameColored}: Installing - npm i`);
        const installScript = "npm i";
        return execWithErrorAsync(installScript, { cwd: this.directory }, this.directory);
    }
}

interface TaskExec<TItem, TResult> {
    item: TItem;
    resolve: (result: TResult) => void;
    reject: (reason?: any) => void;
}

async function queueExec<TItem, TResult>(items: Iterable<TItem>, exec: (item: TItem) => Promise<TResult>, messageCallback?: (item: TItem) => string) {
    let numDone = 0;
    const timedExec = messageCallback ? async (item: TItem) => {
        const startTime = Date.now();
        const result = await exec(item);
        const elapsedTime = (Date.now() - startTime) / 1000;
        info(`[${++numDone}/${p.length}] ${messageCallback(item)} - ${elapsedTime.toFixed(3)}s`);
        return result;
    } : exec;
    const q = queue(async (taskExec: TaskExec<TItem, TResult>) => {
        try {
            taskExec.resolve(await timedExec(taskExec.item));
        } catch (e) {
            taskExec.reject(e);
        }
    }, options.concurrency);
    const p: Promise<TResult>[] = [];
    for (const item of items) {
        p.push(new Promise<TResult>((resolve, reject) => q.push({ item, resolve, reject })));
    }
    return Promise.all(p);
}

export class Packages {
    public constructor(public readonly packages: Package[]) {
    }

    public static loadDir(dirFullPath: string, group: string, ignoredDirFullPaths: string[] | undefined, monoRepo?: MonoRepo,) {
        const packageJsonFileName = path.join(dirFullPath, "package.json");
        if (existsSync(packageJsonFileName)) {
            return [new Package(packageJsonFileName, group, monoRepo)];
        }

        const packages: Package[] = [];
        const files = fs.readdirSync(dirFullPath, { withFileTypes: true });
        files.map((dirent) => {
            if (dirent.isDirectory() && dirent.name !== "node_modules") {
                const fullPath = path.join(dirFullPath, dirent.name);
                if (ignoredDirFullPaths === undefined || !ignoredDirFullPaths.some(name => isSameFileOrDir(name, fullPath))) {
                    packages.push(...Packages.loadDir(fullPath, group, ignoredDirFullPaths, monoRepo));
                }
            }
        });
        return packages;
    }

    /**
     * Loads all packages found under the specified glob path. Ignores files in node_modules.
     *
     * @param globPath The glob path to search for package.json files.
     * @param group The release group (monorepo) the packages are associated with.
     * @param ignoredGlobs Glob paths that should be ignored. Note: `**\/node_modules/**` is always ignored.
     * @param monoRepo A {@link MonoRepo} instance that will be associated with the packages.
     * @returns An array containing all the packages that were found under the globPath.
     */
    public static loadGlob(globPath: string, group: MonoRepoKind, ignoredGlobs: string[] | undefined, monoRepo?: MonoRepo,): Package[] {
        const packages: Package[] = [];

        if (hasMagic(globPath)) {
            if (ignoredGlobs === undefined) {
                ignoredGlobs = [];
            }
            ignoredGlobs.push("**/node_modules/**");

            const globPkg = globPath + "/package.json";
            for (const pkg of globSync(globPkg, { ignore: ignoredGlobs })) {
                console.log(`Loading from glob: ${pkg}`);
                packages.push(new Package(pkg, group, monoRepo));
            }
        } else {
            // Assume a path to a single package
            const packageJsonFileName = path.join(globPath, "package.json");
            if (existsSync(packageJsonFileName)) {
                return [new Package(packageJsonFileName, group, monoRepo)];
            }
        }
        return packages;
    }

    public async cleanNodeModules() {
        return this.queueExecOnAllPackage(pkg => pkg.cleanNodeModules(), "rimraf node_modules");
    }

    public async noHoistInstall(repoRoot: string) {
        return this.queueExecOnAllPackage(pkg => pkg.noHoistInstall(repoRoot), "npm i");
    }

    public async filterPackages(releaseGroup: MonoRepoKind | undefined) {
        if(releaseGroup === undefined) {
            return this.packages;
        }
        return this.packages.filter((p) => p.monoRepo?.kind === releaseGroup);
    }

    public async forEachAsync<TResult>(exec: (pkg: Package) => Promise<TResult>, parallel: boolean, message?: string) {
        if (parallel) { return this.queueExecOnAllPackageCore(exec, message) }

        const results: TResult[] = [];
        for (const pkg of this.packages) {
            results.push(await exec(pkg));
        }
        return results;
    }

    public static async clean(packages: Package[], status: boolean) {
        const cleanP: Promise<ExecAsyncResult>[] = [];
        let numDone = 0;
        const execCleanScript = async (pkg: Package, cleanScript: string) => {
            const startTime = Date.now();
            const result = await execWithErrorAsync(cleanScript, {
                cwd: pkg.directory,
                env: { PATH: `${process.env["PATH"]}${path.delimiter}${path.join(pkg.directory, "node_modules", ".bin")}` }
            }, pkg.nameColored);

            if (status) {
                const elapsedTime = (Date.now() - startTime) / 1000;
                info(`[${++numDone}/${cleanP.length}] ${pkg.nameColored}: ${cleanScript} - ${elapsedTime.toFixed(3)}s`);
            }
            return result;
        };
        for (const pkg of packages) {
            const cleanScript = pkg.getScript("clean");
            if (cleanScript) {
                cleanP.push(execCleanScript(pkg, cleanScript));
            }
        }
        const results = await Promise.all(cleanP);
        return !results.some(result => result.error);
    }

    private async queueExecOnAllPackageCore<TResult>(exec: (pkg: Package) => Promise<TResult>, message?: string) {
        const messageCallback = message ? (pkg: Package) => ` ${pkg.nameColored}: ${message}` : undefined;
        return queueExec(this.packages, exec, messageCallback);
    }

    private async queueExecOnAllPackage(exec: (pkg: Package) => Promise<ExecAsyncResult>, message?: string) {
        const results = await this.queueExecOnAllPackageCore(exec, message);
        return !results.some(result => result.error);
    }
}
