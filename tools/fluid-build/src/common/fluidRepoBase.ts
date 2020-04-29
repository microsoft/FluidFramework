/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { Package, Packages } from "./npmPackage";
import { MonoRepo, MonoRepoKind } from "./monoRepo";

export class FluidRepoBase {
    public readonly clientMonoRepo: MonoRepo;
    public readonly serverMonoRepo: MonoRepo;

    public readonly packages: Packages;
    constructor(public readonly resolvedRoot: string) {
        this.clientMonoRepo = new MonoRepo(MonoRepoKind.Client, this.resolvedRoot);
        this.serverMonoRepo = new MonoRepo(MonoRepoKind.Server, path.join(this.resolvedRoot, "server/routerlicious"));
        this.packages = new Packages(
            [
                ...Packages.loadDir(path.join(this.resolvedRoot, "common")),
                ...this.serverMonoRepo.packages,
                ...this.clientMonoRepo.packages,
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
};