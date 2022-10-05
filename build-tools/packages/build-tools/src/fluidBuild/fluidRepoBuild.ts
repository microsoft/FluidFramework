/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as path from "path";

import { FluidRepo } from "../common/fluidRepo";
import { defaultLogger } from "../common/logging";
import { MonoRepoKind } from "../common/monoRepo";
import { MonoRepo } from "../common/monoRepo";
import { Package, Packages } from "../common/npmPackage";
import { existsSync, globFn, isSameFileOrDir, lookUpDirSync } from "../common/utils";
import { BuildGraph } from "./buildGraph";
import { FluidPackageCheck } from "./fluidPackageCheck";
import { NpmDepChecker } from "./npmDepChecker";
import { ISymlinkOptions, symlinkPackage } from "./symlinkUtils";

const { verbose } = defaultLogger;

export interface IPackageMatchedOptions {
    match: string[];
    all: boolean;
    server: boolean;
    azure: boolean;
    dirs: string[];
}

/** Packages in this list will not have their scripts checked for conformance with repo standards. */
const uncheckedPackages = [
    "@fluid-internal/build-cli",
    "@fluid-internal/version-tools",
    "@fluid-tools/build-cli",
    "@fluid-tools/version-tools",
    "@fluidframework/build-tools",
];

export class FluidRepoBuild extends FluidRepo {
    constructor(resolvedRoot: string, services: boolean) {
        super(resolvedRoot, services);
    }

    public async clean() {
        return Packages.clean(this.packages.packages, false);
    }

    public async uninstall() {
        const cleanPackageNodeModules = this.packages.cleanNodeModules();
        const removePromise = Promise.all([
            this.clientMonoRepo.uninstall(),
            this.serverMonoRepo?.uninstall(),
        ]);

        const r = await Promise.all([cleanPackageNodeModules, removePromise]);
        return r[0] && !r[1].some((ret) => ret?.error);
    }

    public setMatched(options: IPackageMatchedOptions) {
        const hasMatchArgs = options.match.length || options.dirs.length;

        if (hasMatchArgs) {
            let matched = false;
            options.match.forEach((arg) => {
                const regExp = new RegExp(arg);
                if (this.matchWithFilter((pkg) => regExp.test(pkg.name))) {
                    matched = true;
                }
            });

            options.dirs.forEach((arg) => {
                const pkgDir = lookUpDirSync(arg, (currentDir) => {
                    return existsSync(path.join(currentDir, "package.json"));
                });
                if (!pkgDir) {
                    throw new Error(
                        "Directory specified in --dir is not a package. package.json not found.",
                    );
                }
                if (!this.matchWithFilter((pkg) => isSameFileOrDir(pkg.directory, pkgDir))) {
                    throw new Error(
                        `Directory specified in --dir is not in a Fluid repo. ${arg} -> ${path.join(
                            pkgDir,
                            "package.json",
                        )}`,
                    );
                }
                matched = true;
            });
            return matched;
        }

        if (options.all) {
            return this.matchWithFilter(() => true);
        }

        const monoReposToConsider: MonoRepoKind[] = [];

        if (options.azure) {
            monoReposToConsider.push(MonoRepoKind.Azure);
        }
        if (options.server) {
            monoReposToConsider.push(MonoRepoKind.Server);
        }
        if (!options.azure && !options.server) {
            monoReposToConsider.push(MonoRepoKind.Client);
        }

        return this.matchWithFilter((pkg) =>
            pkg.monoRepo ? monoReposToConsider.includes(pkg.monoRepo.kind) : false,
        );
    }

    public async checkPackages(fix: boolean) {
        for (const pkg of this.packages.packages) {
            // TODO: Make this configurable and/or teach fluid-build about new scripts
            if (uncheckedPackages.includes(pkg.name)) {
                verbose(`Skipping ${pkg.nameColored} because it's ignored.`);
                continue;
            }
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
                const tsFiles = await globFn(`${pkg.directory}/**/*.ts`, {
                    ignore: `${pkg.directory}/node_modules`,
                });
                const tsxFiles = await globFn(`${pkg.directory}/**/*.tsx`, {
                    ignore: `${pkg.directory}/node_modules`,
                });
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
        const result = await this.packages.forEachAsync(
            (pkg) => symlinkPackage(this, pkg, this.createPackageMap(), options),
            !options.symlink,
        );
        return Packages.clean(
            result.filter((entry) => entry.count).map((entry) => entry.pkg),
            true,
        );
    }

    public createBuildGraph(options: ISymlinkOptions, buildScriptNames: string[]) {
        return new BuildGraph(this.packages.packages, buildScriptNames, (pkg: Package) => {
            return (dep: Package) => {
                return options.fullSymlink || MonoRepo.isSame(pkg.monoRepo, dep.monoRepo);
            };
        });
    }

    private matchWithFilter(callback: (pkg: Package) => boolean) {
        let matched = false;
        this.packages.packages.forEach((pkg) => {
            if (!pkg.matched && callback(pkg)) {
                verbose(`${pkg.nameColored}: matched`);
                pkg.setMatched();
                matched = true;
            }
        });
        return matched;
    }
}
