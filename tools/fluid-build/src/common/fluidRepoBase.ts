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
    protected readonly baseDirectories = [
        path.join(this.resolvedRoot, "common"),
        this.serverDirectory,
        this.clientDirectory,
        this.exampleComponentsDirectory,
        this.exampleIframeHostDirectory,
    ];

    public readonly packages: Packages;
    constructor(protected readonly resolvedRoot: string) {
        const clientMonoRepo = new MonoRepo(MonoRepoKind.Client,
            [this.clientDirectory, this.exampleComponentsDirectory, this.exampleIframeHostDirectory]);
        const serverMonoRepo = new MonoRepo(MonoRepoKind.Server,
            [this.serverDirectory]);
        this.packages = new Packages(
            [...Packages.loadDir(path.join(this.resolvedRoot, "common")), ...clientMonoRepo.packages, ...serverMonoRepo.packages]
        );
    }

    public getMonoRepo(pkg: Package) {
        return pkg.directory.startsWith(this.serverDirectory) ? MonoRepoKind.Server :
            pkg.directory.startsWith(this.clientDirectory)
                || pkg.directory.startsWith(this.exampleComponentsDirectory)
                || pkg.directory.startsWith(this.exampleIframeHostDirectory) ? MonoRepoKind.Client : MonoRepoKind.None
    }

    public getMonoRepoPath(monoRepo: MonoRepoKind) {
        switch (monoRepo) {
            case MonoRepoKind.Client:
                return path.join(this.clientDirectory, "..");
            case MonoRepoKind.Server:
                return path.join(this.serverDirectory, "..");
            default:
                return undefined;
        }
    }
    public getMonoRepoNodeModulePath(monoRepo: MonoRepoKind) {
        switch (monoRepo) {
            case MonoRepoKind.Client:
                return path.join(this.clientDirectory, "..", "node_modules");
            case MonoRepoKind.Server:
                return path.join(this.serverDirectory, "..", "node_modules");
            default:
                return undefined;
        }
    }

    public createPackageMap() {
        return new Map<string, Package>(this.packages.packages.map(pkg => [pkg.name, pkg]));
    }

    public reload() {
        this.packages.packages.forEach(pkg => pkg.reload());
    }
};