/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { Package, Packages } from "./npmPackage";
import { MonoRepo, MonoRepoKind } from "./monoRepo";
import { getPackageManifest } from "./fluidUtils";
import { ExecAsyncResult } from "./utils";

export interface IPackageManifest {
    repoPackages: {
        [name: string]: string | IFluidRepoPackage | (string | IFluidRepoPackage)[]
    },
    generatorName?: string
}

export interface IFluidRepoPackage {
    directory: string,
    ignoredDirs?: string[]
}

export class FluidRepo {
    public readonly clientMonoRepo: MonoRepo;
    public readonly serverMonoRepo?: MonoRepo;

    public readonly packages: Packages;
    constructor(public readonly resolvedRoot: string, services: boolean) {
        const packageManifest = getPackageManifest(resolvedRoot);

        const loadOneEntry = (item: string | IFluidRepoPackage, group: string) => {
            if (typeof item === "string") {
                return Packages.loadDir(path.join(resolvedRoot, item), group);
            }
            return Packages.loadDir(path.join(resolvedRoot, item.directory), group, undefined, item.ignoredDirs);
        }
        const loadedPackages: Package[] = [];
        let clientMonoRepo: MonoRepo | undefined;
        for (const group in packageManifest.repoPackages) {
            const item = packageManifest.repoPackages[group];
            if (group === "client") {
                clientMonoRepo = new MonoRepo(MonoRepoKind.Client, path.join(this.resolvedRoot, item as string));
                loadedPackages.push(...clientMonoRepo.packages);
            } else if (group === "server") {
                this.serverMonoRepo = new MonoRepo(MonoRepoKind.Server, path.join(this.resolvedRoot, item as string));
                loadedPackages.push(...this.serverMonoRepo.packages);
            } else if (group !== "services" || services) {
                if (Array.isArray(item)) {
                    for (const i of item) {
                        loadedPackages.push(...loadOneEntry(i, group));
                    }
                } else {
                    loadedPackages.push(...loadOneEntry(item, group));
                }
            }
        }

        if (!clientMonoRepo) {
            throw new Error("client entry not exist in package.json")
        }
        this.clientMonoRepo = clientMonoRepo;
        this.packages = new Packages(loadedPackages);
    }

    public createPackageMap() {
        return new Map<string, Package>(this.packages.packages.map(pkg => [pkg.name, pkg]));
    }

    public reload() {
        this.packages.packages.forEach(pkg => pkg.reload());
    }

    public static async ensureInstalled(packages: Package[], check: boolean = true) {
        const installedMonoRepo = new Set<MonoRepo>();
        const installPromises: Promise<ExecAsyncResult>[] = [];
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
        return FluidRepo.ensureInstalled(this.packages.packages);
    }
};
