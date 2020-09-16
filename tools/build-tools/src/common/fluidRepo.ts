/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { Package, Packages } from "./npmPackage";
import { MonoRepo, MonoRepoKind } from "./monoRepo";
import { getPackageManifest } from "./fluidUtils";
import { assert } from "console";

export interface IPackageManifest {
    repoPackages: {
        client:  IFluidRepoPackage[],
        server: {
            required: IFluidRepoPackage[],
            optional?: IFluidRepoPackage[],
        }
    },
    serverPath?: string,
    releaseOrder?: {
        preRepo?: string[][],
        postRepo?: string[][]
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
        this.clientMonoRepo = new MonoRepo(MonoRepoKind.Client, this.resolvedRoot);
        if (packageManifest.serverPath) {
            this.serverMonoRepo = new MonoRepo(MonoRepoKind.Server, path.join(this.resolvedRoot, packageManifest.serverPath));
        }

        let additionalPackages: Package[] = [];

        packageManifest.repoPackages.client.forEach((fluidPackage: IFluidRepoPackage) => {
            additionalPackages = [
                ...additionalPackages,
                ...Packages.loadDir(path.join(resolvedRoot, fluidPackage.directory), undefined, fluidPackage.ignoredDirs)
            ]
        });

        if (services) {
            assert(packageManifest.repoPackages.server.optional, "Requested optional server packages without passing parameters in package.json");
            packageManifest.repoPackages.server.optional!.forEach((fluidPackage: IFluidRepoPackage) => {
                additionalPackages = [
                    ...additionalPackages,
                    ...Packages.loadDir(path.join(resolvedRoot, fluidPackage.directory), undefined, fluidPackage.ignoredDirs)
                ]
            });
        } else {
            packageManifest.repoPackages.server.required.forEach((fluidPackage: IFluidRepoPackage) => {
                additionalPackages = [
                    ...additionalPackages,
                    ...Packages.loadDir(path.join(resolvedRoot, fluidPackage.directory), undefined, fluidPackage.ignoredDirs)
                ]
            });
        }

        console.log(JSON.stringify(additionalPackages));

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
        return FluidRepo.ensureInstalled(this.packages.packages);
    }
};
