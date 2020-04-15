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
                ...this.clientMonoRepo.packages, 
                ...this.serverMonoRepo.packages,
            ]
        );
    }

    public createPackageMap() {
        return new Map<string, Package>(this.packages.packages.map(pkg => [pkg.name, pkg]));
    }

    public reload() {
        this.packages.packages.forEach(pkg => pkg.reload());
    }
};