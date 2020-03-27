/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { Package, Packages } from "./npmPackage";
import { MonoRepo, MonoRepoKind } from "./monoRepo";


export class FluidRepoBase {
    // TODO: Should read lerna.json to determine
    protected readonly clientDirectory = path.join(this.resolvedRoot, "packages");
    protected readonly serverDirectory = path.join(this.resolvedRoot, "server/routerlicious/packages");
    protected readonly exampleComponentsDirectory = path.join(this.resolvedRoot, "examples/components");
    protected readonly exampleIframeHostDirectory = path.join(this.resolvedRoot, "examples/hosts/iframe-host");

    public readonly clientMonoRepo: MonoRepo;
    public readonly serverMonoRepo: MonoRepo;

    public readonly packages: Packages;
    constructor(protected readonly resolvedRoot: string) {
        this.clientMonoRepo = new MonoRepo(MonoRepoKind.Client,
            [this.clientDirectory, this.exampleComponentsDirectory, this.exampleIframeHostDirectory]);
        this.serverMonoRepo = new MonoRepo(MonoRepoKind.Server,
            [this.serverDirectory]);
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