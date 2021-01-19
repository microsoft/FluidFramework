/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Package, Packages } from "../common/npmPackage";
import { existsSync, globFn, lookUpDirSync, isSameFileOrDir } from "../common/utils";
import { FluidPackageCheck } from "./fluidPackageCheck";
import { FluidRepo } from "../common/fluidRepo";
import { MonoRepoKind } from "../common/monoRepo";
import { NpmDepChecker } from "./npmDepChecker";
import { ISymlinkOptions, symlinkPackage } from "./symlinkUtils";
import { BuildGraph } from "./buildGraph";
import { logVerbose } from "../common/logging";
import { MonoRepo } from "../common/monoRepo";
import * as path from "path";

export interface IPackageMatchedOptions {
    match: string[];
    all: boolean;
    server: boolean;
    dirs: string[];
};

export class FluidRepoBuild extends FluidRepo {
    constructor(resolvedRoot: string, services: boolean) {
        super(resolvedRoot, services);
    }

    public async clean() {
        return Packages.clean(this.packages.packages, false);
    }

    public async uninstall() {
        const cleanPackageNodeModules = this.packages.cleanNodeModules();
        const removePromise = Promise.all(
            [this.clientMonoRepo.uninstall(), this.serverMonoRepo?.uninstall()]
        );

        const r = await Promise.all([cleanPackageNodeModules, removePromise]);
        return r[0] && !r[1].some(ret => ret?.error);
    };

    public setMatched(options: IPackageMatchedOptions) {
        const hasMatchArgs = options.match.length || options.dirs.length;

        if (hasMatchArgs) {
            let matched = false;
            options.match.forEach((arg) => {
                const regExp = new RegExp(arg);
                if (this.matchWithFilter(pkg => regExp.test(pkg.name))) {
                    matched = true;
                }
            });

            options.dirs.forEach((arg) => {
                const pkgDir = lookUpDirSync(arg, (currentDir) => {
                    return existsSync(path.join(currentDir, "package.json"));
                });
                if (!pkgDir) {
                    throw new Error("Directory specified in --dir is not a package. package.json not found.");
                }
                if (!this.matchWithFilter(pkg => isSameFileOrDir(pkg.directory, pkgDir))) {
                    throw new Error(`Directory specified in --dir is not in a Fluid repo. ${arg} -> ${path.join(pkgDir, "package.json")}`);
                }
                matched = true;
            });
            return matched;
        }

        if (options.all) {
            return this.matchWithFilter(pkg => true);
        }

        const matchMonoRepo = options.server ? MonoRepoKind.Server : MonoRepoKind.Client;
        return this.matchWithFilter(pkg => pkg.monoRepo?.kind === matchMonoRepo);
    }

    public async checkPackages(fix: boolean) {
        for (const pkg of this.packages.packages) {
            if (FluidPackageCheck.checkScripts(pkg, fix)) {
                await pkg.savePackageJson();
            }
            await FluidPackageCheck.checkNpmIgnore(pkg, fix);
            await FluidPackageCheck.checkTsConfig(pkg, fix);
            await FluidPackageCheck.checkTestDir(pkg, fix);
        }
    }
    public async depcheck() {
        for (const pkg of this.packages.packages) {
            // Fluid specific
            let checkFiles: string[];
            if (pkg.packageJson.dependencies) {
                const tsFiles = await globFn(`${pkg.directory}/**/*.ts`, { ignore: `${pkg.directory}/node_modules` });
                const tsxFiles = await globFn(`${pkg.directory}/**/*.tsx`, { ignore: `${pkg.directory}/node_modules` });
                checkFiles = tsFiles.concat(tsxFiles);
            } else {
                checkFiles = [];
            }

            const npmDepChecker = new NpmDepChecker(pkg, checkFiles);
            if (await npmDepChecker.run()) {
                await pkg.savePackageJson();
            }
        }
    }

    public async symlink(options: ISymlinkOptions) {
        // Only do parallel if we are checking only
        const result = await this.packages.forEachAsync(pkg => symlinkPackage(this, pkg, this.createPackageMap(), options), !options.symlink);
        return Packages.clean(result.filter(entry => entry.count).map(entry => entry.pkg), true);
    }

    public createBuildGraph(options: ISymlinkOptions, buildScriptNames: string[]) {
        return new BuildGraph(this.packages.packages, buildScriptNames,
            (pkg: Package) => {
                return (dep: Package) => {
                    return options.fullSymlink || MonoRepo.isSame(pkg.monoRepo, dep.monoRepo);
                }
            });
    }

    private matchWithFilter(callback: (pkg: Package) => boolean) {
        let matched = false;
        this.packages.packages.forEach((pkg) => {
            if (!pkg.matched && callback(pkg)) {
                logVerbose(`${pkg.nameColored}: matched`);
                pkg.setMatched();
                matched = true;
            }
        });
        return matched;
    }
};

