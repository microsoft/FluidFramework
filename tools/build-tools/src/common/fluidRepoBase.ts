/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { Package, Packages } from "./npmPackage";
import { MonoRepo, MonoRepoKind } from "./monoRepo";

export enum FluidRepoName {
    FDL,
    Kampa,
    Default
}

export class FluidRepoBase {
    public fluidRepoName = FluidRepoName.Default;

    // There are two separate definitions for repos as there is a common pattern of there
    // being a Fluid client side and server side repo. However, not all client repos necessarily
    // need to have a server mono repo. Those that do should drop the undefined type definition.
    public readonly clientMonoRepo: MonoRepo;
    public readonly serverMonoRepo: MonoRepo | undefined;

    public packages: Packages;
    constructor(public readonly resolvedRoot: string, services: boolean) {
        this.clientMonoRepo = new MonoRepo(MonoRepoKind.Client, this.resolvedRoot);
        this.packages = new Packages(this.clientMonoRepo.packages);
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
};
