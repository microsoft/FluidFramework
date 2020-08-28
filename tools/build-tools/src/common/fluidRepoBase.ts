/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { Package, Packages } from "./npmPackage";
import { MonoRepo, MonoRepoKind } from "./monoRepo";
import { FluidPackageCheck } from "./build/fluidPackageCheck";
import { globFn } from "./utils";
import { NpmDepChecker } from "./build/npmDepChecker";
import { ISymlinkOptions, symlinkPackage } from "./build/symlinkUtils";
import { BuildGraph } from "./build/buildGraph";
import { logVerbose } from "./logging";

export interface IPackageMatchedOptions {
    match: string[];
    all: boolean;
    server: boolean;
};

export interface IPackageManifest {
    repoPackages: {
        client: IFluidRepoPackage[],
        server: IFluidRepoPackage[]
    },
    serverPath: string
}

export interface IFluidRepoPackage {
    directory: string,
    ignoredDirs?: string[],
    monoRepo?: MonoRepo
}

export class FluidRepoBase {
    // There are two separate definitions for repos as there is a common pattern of there
    // being a Fluid client side and server side repo. However, not all client repos necessarily
    // need to have a server mono repo.
    public readonly clientMonoRepo: MonoRepo;
    public readonly serverMonoRepo: MonoRepo | undefined;

    public packages: Packages;
    constructor(public readonly resolvedRoot: string, serverPath: string, additionalRepoPackages?: IFluidRepoPackage[]) {
        this.clientMonoRepo = new MonoRepo(MonoRepoKind.Client, this.resolvedRoot);
        if (serverPath) {
            this.serverMonoRepo = new MonoRepo(MonoRepoKind.Server, path.join(this.resolvedRoot, serverPath));
        }
        let additionalPackages: Package[] = [];
        additionalRepoPackages?.forEach((fluidPackage: IFluidRepoPackage) => {
                additionalPackages = [
                    ...additionalPackages,
                    ...Packages.loadDir(path.join(resolvedRoot, fluidPackage.directory), fluidPackage.monoRepo, fluidPackage.ignoredDirs)
                ]
        });
        this.packages = new Packages(
            [
                ...this.clientMonoRepo.packages,
                ...(this.serverMonoRepo?.packages || []),
                ...additionalPackages,
            ]
        );
    }

    public createPackageMap() {
        return new Map<string, Package>(this.packages.packages.map(pkg => [pkg.name, pkg]));
    }

    public reload() {
        this.packages.packages.forEach(pkg => pkg.reload());
    }

    public static async ensureInstalled(packages: Package[], check: boolean = true) {
        const installedMonoRepo = new Set<MonoRepo>();
        const installPromises: Promise<any>[] = [];
        for (const pkg of packages) {
            if (!check || !await pkg.checkInstall(false)) {
                if (pkg.monoRepo) {
                    if (!installedMonoRepo.has(pkg.monoRepo)) {
                        installedMonoRepo.add(pkg.monoRepo);
                        installPromises.push(pkg.monoRepo.install());
                    }
                } else {
                    installPromises.push(pkg.install());
                }
            }
        }
        const rets = await Promise.all(installPromises);
        return !rets.some(ret => ret.error);
    }

    public async install(nohoist: boolean = false) {
        if (nohoist) {
            return this.packages.noHoistInstall(this.resolvedRoot);
        }
        return FluidRepoBase.ensureInstalled(this.packages.packages);
    }


    public setMatched(options: IPackageMatchedOptions) {
        const hasMatchArgs = options.match.length;

        if (hasMatchArgs) {
            let matched = false;
            options.match.forEach((arg) => {
                const regExp = new RegExp(arg);
                if (this.matchWithFilter(pkg => regExp.test(pkg.name))) {
                    matched = true;
                }
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
        const result = await this.packages.forEachAsync(pkg => symlinkPackage(pkg, this.createPackageMap(), options), !options.symlink);
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
};
