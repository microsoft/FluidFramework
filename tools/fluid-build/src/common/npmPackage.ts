/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { queue } from "async";
import * as chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import { sortPackageJson } from "sort-package-json";
import { logStatus, logVerbose } from "./logging";
import {
    copyFileAsync,
    execWithErrorAsync,
    existsSync,
    lstatAsync,
    mkdirAsync,
    realpathAsync,
    rimrafWithErrorAsync,
    unlinkAsync,
    symlinkAsync,
    writeFileAsync,
    ExecAsyncResult,
    renameAsync
} from "./utils"

import { options } from "../fluidBuild/options";
import * as semver from "semver";

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

function writeBin(dir: string, pkgName: string, binName: string, binPath: string) {
    const outFile = path.normalize(`${dir}/node_modules/.bin/${binName}`);
    if (process.platform === "win32") {
        const winpath = `%~dp0\\..\\node_modules\\${path.normalize(pkgName)}\\${path.normalize(binPath)}`;
        const cmd =
            `@IF EXIST "%~dp0\\node.exe" (
  "%~dp0\\node.exe"  "${winpath}" %*
) ELSE (
  @SETLOCAL
  @SET PATHEXT=%PATHEXT:;.JS;=;%
  node  "${winpath}" %*
)`;
        logVerbose(`Writing ${outFile}.cmd`);
        writeFileAsync(`${binName}.cmd`, cmd);
    }

    const posixpath = `$basedir/../node_modules/${path.posix.normalize(pkgName)}/${path.posix.normalize(binPath)}`;
    const sh = `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")

case \`uname\` in
    *CYGWIN*) basedir=\`cygpath -w "$basedir"\`;;
esac

if [ -x "$basedir/node" ]; then
  "$basedir/node"  "${posixpath}" "$@"
  ret=$?
else
  node  "${posixpath}" "$@"
  ret=$?
fi
exit $ret`;

    logVerbose(`Writing ${outFile}`);
    writeFileAsync(outFile, sh);
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
                yield ({ name: item, version: packageJson.dependencies[item] });
            }
            for (const item in packageJson.devDependencies) {
                yield ({ name: item, version: packageJson.devDependencies[item] });
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
        return this.packageJson.scripts[name];
    }

    public async cleanNodeModules() {
        return rimrafWithErrorAsync(path.join(this.directory, "node_modules"), this.nameColored);
    }

    public async savePackageJson() {
        return writeFileAsync(this.packageJsonFileName, `${JSON.stringify(sortPackageJson(this.packageJson), undefined, 2)}\n`);
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

    public async symlink(buildPackages: Map<string, Package>, fix: boolean) {
        // Fluid specific
        for (const { name: dep, version } of this.combinedDependencies) {
            const depBuildPackage = buildPackages.get(dep);
            // Check and fix link if it is a known package and version satisfy the version.
            // TODO: check of extranous symlinks
            if (depBuildPackage && semver.satisfies(depBuildPackage.version, version)) {
                const symlinkPath = path.join(this.directory, "node_modules", dep);
                try {
                    let stat: fs.Stats | undefined;
                    if (existsSync(symlinkPath)) {
                        stat = await lstatAsync(symlinkPath);
                        if (stat.isSymbolicLink && await realpathAsync(symlinkPath) === depBuildPackage.directory) {
                            // Have the correct symlink, continue
                            continue;
                        }
                    }
                    if (!fix) {
                        console.warn(`${this.nameColored}: warning: dependent package ${depBuildPackage.nameColored} not linked. Use --symlink to fix.`);
                        continue;
                    }

                    // Fixing the symlink
                    if (stat) {
                        // Rename existing
                        if (!options.nohoist) {
                            console.warn(`${this.nameColored}: warning: renaming existing package in ${symlinkPath}`);
                        }
                        const replace = true;
                        if (replace) {
                            if (stat.isDirectory()) {
                                await rimrafWithErrorAsync(symlinkPath, this.nameColored);
                            } else {
                                await unlinkAsync(symlinkPath);
                            }
                        } else {
                            await renameAsync(symlinkPath, path.join(path.dirname(symlinkPath), `_${path.basename(symlinkPath)}`));
                        }
                    } else {
                        // Ensure the directory exist
                        const symlinkDir = path.join(symlinkPath, "..");
                        if (!existsSync(symlinkDir)) {
                            await mkdirAsync(symlinkDir, { recursive: true });
                        }
                    }
                    // Create symlink
                    await symlinkAsync(depBuildPackage.directory, symlinkPath, "junction");

                    if (depBuildPackage.packageJson.bin) {
                        for (var name of Object.keys(depBuildPackage.packageJson.bin)) {
                            writeBin(this.directory, depBuildPackage.name, name, depBuildPackage.packageJson.bin[name]);
                        }
                    }
                } catch (e) {
                    throw new Error(`symlink failed on ${symlinkPath}.\n ${e}`);
                }
            }
        }
    }
};

interface TaskExec<TItem, TResult> {
    item: TItem;
    resolve: (result: TResult) => void;
    reject: (reason?: any) => void;
};

async function queueExec<TItem, TResult>(items: Iterable<TItem>, exec: (item: TItem) => Promise<TResult>, messageCallback?: (item: TItem) => string) {
    let numDone = 0;
    const timedExec = messageCallback ? async (item: TItem) => {
        const startTime = Date.now();
        const result = await exec(item);
        const elapsedTime = (Date.now() - startTime) / 1000;
        logStatus(`[${++numDone}/${p.length}] ${messageCallback(item)} - ${elapsedTime.toFixed(3)}s`);
        return result;
    } : exec;
    const q = queue(async (taskExec: TaskExec<TItem, TResult>, callback) => {
        try {
            taskExec.resolve(await timedExec(taskExec.item));
        } catch (e) {
            taskExec.reject(e);
        }
        callback();
    }, options.concurrency);
    const p: Promise<TResult>[] = [];
    for (const item of items) {
        p.push(new Promise<TResult>((resolve, reject) => q.push({ item, resolve, reject })));
    }
    return Promise.all(p);
}

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

    public async symlink(fix: boolean) {
        const packageMap = new Map<string, Package>(this.packages.map(pkg => [pkg.name, pkg]));
        return this.queueExecOnAllPackageCore(pkg => pkg.symlink(packageMap, fix), options.nohoist ? "symlink" : "")
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
