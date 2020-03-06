/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { Package, Packages } from "./npmPackage";

export enum MonoRepo {
    None,
    Client,
    Server,
};

export class FluidRepoBase {
    // TODO: Should read lerna.json to determine
    protected readonly clientDirectory = path.join(this.resolvedRoot, "packages");
    protected readonly serverDirectory = path.join(this.resolvedRoot, "server/routerlicious/packages");
    protected readonly exampleDirectory = path.join(this.resolvedRoot, "examples/components");
    protected readonly baseDirectories = [
        path.join(this.resolvedRoot, "common"),
        this.serverDirectory,
        this.clientDirectory,
        this.exampleDirectory,
    ];

    public readonly packages: Packages;
    constructor(protected readonly resolvedRoot: string) {
        this.packages = Packages.load(this.baseDirectories);
    }

    public getMonoRepo(pkg: Package) {
        return pkg.directory.startsWith(this.serverDirectory) ? MonoRepo.Server :
            pkg.directory.startsWith(this.clientDirectory) || pkg.directory.startsWith(this.exampleDirectory) ? MonoRepo.Client : MonoRepo.None
    }

    public isSameMonoRepo(monoRepo: MonoRepo, pkg: Package) {
        return monoRepo !== MonoRepo.None && monoRepo === this.getMonoRepo(pkg);
    }

    public getMonoRepoPath(monoRepo: MonoRepo) {
        switch (monoRepo) {
            case MonoRepo.Client:
                return path.join(this.clientDirectory, "..");
            case MonoRepo.Server:
                return path.join(this.serverDirectory, "..");
            default:
                return undefined;
        }
    }
    public getMonoRepoNodeModulePath(monoRepo: MonoRepo) {
        switch (monoRepo) {
            case MonoRepo.Client:
                return path.join(this.clientDirectory, "..", "node_modules");
            case MonoRepo.Server:
                return path.join(this.serverDirectory, "..", "node_modules");
            default:
                return undefined;
        }
    }

    public createPackageMap() {
        return new Map<string, Package>(this.packages.packages.map(pkg => [pkg.name, pkg]));
    }
};