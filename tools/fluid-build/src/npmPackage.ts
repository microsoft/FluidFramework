/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { queue } from "async";
import * as chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import { logStatus, logVerbose } from "./common/logging";
import { globFn, copyFileAsync, execWithErrorAsync, existsSync, lstatAsync, mkdirAsync, realpathAsync, rimrafWithErrorAsync, unlinkAsync, symlinkAsync, writeFileAsync, ExecAsyncResult } from "./common/utils"
import { NpmDepChecker } from "./npmDepChecker";
import { options } from "./options";

interface IPerson {
    name: string;
    email: string;
    url: string;
}

interface IPackage {
    name: string;
    version: string;
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
};

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

    public readonly packageJson: Readonly<IPackage>;
    private readonly packageId = Package.packageCount++;
    private _matched: boolean = false;
    private _markForBuild: boolean = false;

    constructor(private readonly packageJsonFileName: string) {
        this.packageJson = require(packageJsonFileName);
        logVerbose(`Package Loaded: ${this.nameColored}`);
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
        return this.packageJson.dependencies ? Object.keys(this.packageJson.dependencies) : [];
    }

    public get combinedDependencies() {
        const it = function* (packageJson: IPackage) {
            for (const item in packageJson.dependencies) {
                yield (item);
            }
            for (const item in packageJson.devDependencies) {
                yield (item);
            }
        }
        return it(this.packageJson);
    }

    public get directory(): string {
        return path.dirname(this.packageJsonFileName);
    }

    public getScript(name: string): string | undefined {
        return this.packageJson.scripts[name];
    }

    public async checkScripts() {
        // Fluid specific
        let fixed = this.checkBuildScripts();
        fixed = this.checkTestCoverageScripts() || fixed;

        if (fixed) {
            await this.savePackageJson();
        }
    }

    public checkTestCoverageScripts() {
        let fixed = false;
        // Fluid specific
        const testCoverageScript = this.getScript("test:coverage");
        if (testCoverageScript && testCoverageScript.startsWith("nyc")) {
            if (!this.packageJson.devDependencies.nyc) {
                console.warn(`${this.nameColored}: warning: missing nyc dependency`);
            }
            if (this.packageJson.nyc) {
                if (this.packageJson.nyc["exclude-after-remap"] !== false) {
                    console.warn(`${this.nameColored}: warning: nyc.exclude-after-remap need to be false`);
                    if (options.fixScripts) {
                        this.packageJson.nyc["exclude-after-remap"] = false;
                        fixed = true;
                    }
                }
            } else {
                console.warn(`${this.nameColored}: warning: missing nyc configuration`);
            }
        }

        return fixed;
    }

    public checkBuildScripts() {
        // Fluid specific
        let fixed = false;
        const buildScript = this.getScript("build");
        if (buildScript) {
            if (buildScript.startsWith("echo ")) {
                return;
            }
            // These are script rules in the FluidFramework repo

            // Default build script, tsc + tslint (with optional build:webpack)
            const build: string[] = ["build:compile"];

            // all build tasks, but optional build:webpack
            const buildCompile: string[] = [];

            // all build and lint steps (build + webpack)
            const buildFull: string[] = ["build"];

            // all build steps (build:compile + webpack)
            const buildFullCompile: string[] = ["build:compile"];

            // all build steps prod
            const buildCompileMin: string[] = ["build:compile"];
            const buildPrefix = this.packageJson.scripts["build:genver"] ? "npm run build:genver && " : "";
            if (this.getScript("tsc")) {
                buildCompile.push("tsc");
            }
            if (this.getScript("build:esnext")) {
                buildCompile.push("build:esnext");
            }

            if (this.getScript("build:copy")) {
                buildCompile.push("build:copy");
            }

            if (this.getScript("tslint")) {
                build.push("tslint");
            }

            if (this.getScript("less")) {
                buildCompile.push("less");
            }

            let implicitWebpack = true;
            if (this.getScript("build:webpack:min")) {
                buildCompileMin.push("build:webpack:min");
                implicitWebpack = false;
            }
            if (this.getScript("build:webpack")) {
                buildCompile.push("build:webpack");
                implicitWebpack = false;
            }

            if (implicitWebpack && this.getScript("webpack")) {
                buildFull.push("webpack");
                buildFullCompile.push("webpack");
            }

            if (buildCompile.length === 0) {
                console.warn(`${this.nameColored}: warning: can't detect anything to build`);
                return;
            }

            const check = (scriptName: string, parts: string[], prefix = "") => {
                const expected = prefix +
                    (parts.length > 1 ? `concurrently npm:${parts.join(" npm:")}` : `npm run ${parts[0]}`);
                if (this.packageJson.scripts[scriptName] !== expected) {
                    console.warn(`${this.nameColored}: warning: non-conformant script ${scriptName}`);
                    console.warn(`${this.nameColored}: warning:   expect: ${expected}`);
                    console.warn(`${this.nameColored}: warning:      got: ${this.packageJson.scripts[scriptName]}`);
                    if (options.fixScripts) {
                        this.packageJson.scripts[scriptName] = expected;
                        fixed = true;
                    }
                }
            }
            check("build", build, buildPrefix);
            check("build:compile", buildCompile);
            check("build:full", buildFull);
            check("build:full:compile", buildFullCompile);
            check("build:compile:min", buildCompileMin);

            if (!this.getScript("clean")) {
                console.warn(`${this.nameColored}: warning: package has "build" script without "clean" script`);
            }
        }
        return fixed;
    }
    public async depcheck() {
        let checkFiles: string[];
        if (this.packageJson.dependencies) {
            const tsFiles = await globFn(`${this.directory}/**/*.ts`, { ignore: `${this.directory}/node_modules` });
            const tsxFiles = await globFn(`${this.directory}/**/*.tsx`, { ignore: `${this.directory}/node_modules` });
            checkFiles = tsFiles.concat(tsxFiles);
        } else {
            checkFiles = [];
        }

        const npmDepChecker = new NpmDepChecker(this, checkFiles);
        if (await npmDepChecker.run()) {
            await this.savePackageJson();
        }
    }

    private async savePackageJson() {
        return writeFileAsync(this.packageJsonFileName, `${JSON.stringify(this.packageJson, undefined, 2)}\n`);
    }

    private get color() {
        return Package.chalkColor[this.packageId % Package.chalkColor.length];
    }

    public async cleanNodeModules() {
        return rimrafWithErrorAsync(path.join(this.directory, "node_modules"), this.nameColored);
    }

    public async noHoistInstall(repoRoot: string) {
        const rootNpmRC = path.join(repoRoot, ".npmrc")
        const npmRC = path.join(this.directory, ".npmrc");
        const npmCommand = "npm i --no-package-lock --no-shrinkwrap";

        await copyFileAsync(rootNpmRC, npmRC);
        const result = await execWithErrorAsync(npmCommand, { cwd: this.directory }, this.nameColored);
        await unlinkAsync(npmRC);

        return result;
    }

    public async symlink(buildPackages: Map<string, Package>) {
        for (const dep of this.combinedDependencies) {
            const depBuildPackage = buildPackages.get(dep);
            if (depBuildPackage) {
                const symlinkPath = path.join(this.directory, "node_modules", dep);
                const symlinkDir = path.join(symlinkPath, "..");
                try {
                    if (existsSync(symlinkPath)) {
                        const stat = await lstatAsync(symlinkPath);
                        if (!stat.isSymbolicLink || await realpathAsync(symlinkPath) !== depBuildPackage.directory) {
                            if (stat.isDirectory) {
                                await rimrafWithErrorAsync(symlinkPath, this.nameColored);
                            } else {
                                await unlinkAsync(symlinkPath);
                            }
                            await symlinkAsync(depBuildPackage.directory, symlinkPath, "junction");
                            if (!options.nohoist) {
                                console.warn(`${this.nameColored}: warning: replaced existing package ${symlinkPath}`);
                            }
                        }
                    } else {
                        if (!existsSync(symlinkDir)) {
                            await mkdirAsync(symlinkDir, { recursive: true });
                        }
                        await symlinkAsync(depBuildPackage.directory, symlinkPath, "junction");
                    }
                } catch (e) {
                    throw new Error(`symlink failed on ${symlinkPath}. ${e}`);
                }
            }
        }
    }
};

interface PackageTaskExec<T> {
    pkg: Package;
    resolve: (result: T) => void;
};

export class Packages {

    public static load(dirs: string[]) {
        const packages: Package[] = [];
        for (const dir of dirs) {
            packages.push(...Packages.loadCore(dir));
        }
        return new Packages(packages);
    }

    private static loadCore(dir: string) {
        const packages: Package[] = [];
        const files = fs.readdirSync(dir, { withFileTypes: true });
        files.map((dirent) => {
            if (dirent.isDirectory()) {
                if (dirent.name !== "node_modules") {
                    packages.push(...Packages.loadCore(path.join(dir, dirent.name)));
                }
                return;
            }
            if (dirent.isFile() && dirent.name === "package.json") {
                const packageJsonFileName = path.join(dir, "package.json");
                packages.push(new Package(packageJsonFileName))
            }
        });
        return packages;
    }

    private constructor(public readonly packages: Package[]) {
    }

    public async cleanNodeModules() {
        return this.queueExecOnAllPackage(pkg => pkg.cleanNodeModules(), "rimraf node_modules");
    }

    public async noHoistInstall(repoRoot: string) {
        return this.queueExecOnAllPackage(pkg => pkg.noHoistInstall(repoRoot), "npm i");
    }

    public async symlink() {
        const packageMap = new Map<string, Package>(this.packages.map(pkg => [pkg.name, pkg]));
        return this.queueExecOnAllPackageCore(pkg => pkg.symlink(packageMap), options.nohoist ? "symlink" : "")
    }

    public async checkScripts() {
        for (const pkg of this.packages) {
            await pkg.checkScripts();
        }
    }

    private async queueExecOnAllPackageCore<TResult>(exec: (pkg: Package) => Promise<TResult>, message?: string) {
        let numDone = 0;
        const timedExec = message ? async (pkg: Package) => {
            const startTime = Date.now();
            const result = await exec(pkg);
            const elapsedTime = (Date.now() - startTime) / 1000;
            logStatus(`[${++numDone}/${p.length}] ${pkg.nameColored}: ${message} - ${elapsedTime.toFixed(3)}s`);
            return result;
        } : exec;
        const q = queue(async (taskExec: PackageTaskExec<TResult>, callback) => {
            taskExec.resolve(await timedExec(taskExec.pkg));
            callback();
        }, options.concurrency);
        const p = this.packages.map(pkg => new Promise<TResult>(resolve => q.push({ pkg, resolve })));
        return Promise.all(p);
    }

    private async queueExecOnAllPackage(exec: (pkg: Package) => Promise<ExecAsyncResult>, message?: string) {
        const results = await this.queueExecOnAllPackageCore(exec, message);
        return !results.some(result => result.error);
    }
}