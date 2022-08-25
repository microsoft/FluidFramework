/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { getPackageManifest } from "./fluidUtils";
import { defaultLogger, Logger } from "./logging";
import { isMonoRepoKind, MonoRepo, MonoRepoKind } from "./monoRepo";
import { Package, Packages } from "./npmPackage";
import { ExecAsyncResult } from "./utils";

export interface IPackageManifest {
    repoPackages: {
        [name: string]: IFluidRepoPackageEntry;
    },
    generatorName?: string
}

export interface IFluidRepoPackage {
    directory: string,
    ignoredDirs?: string[]
}

export type IFluidRepoPackageEntry = string | IFluidRepoPackage | (string | IFluidRepoPackage)[];

export class FluidRepo {
    /**
     * @deprecated Use .releaseGroups instead.
     */
    public readonly monoRepos = new Map<MonoRepoKind, MonoRepo>();

    public get releaseGroups() {
        return this.monoRepos;
    }

    public readonly packages: Packages;

    /**
     * @deprecated Use monoRepos.get() instead.
     */
    public get clientMonoRepo(): MonoRepo {
        return this.monoRepos.get(MonoRepoKind.Client)!;
    }

    /**
     * @deprecated Use monoRepos.get() instead.
     */
    public get serverMonoRepo(): MonoRepo | undefined {
        return this.monoRepos.get(MonoRepoKind.Server);
    }

    /**
     * @deprecated Use monoRepos.get() instead.
     */
    public get azureMonoRepo(): MonoRepo | undefined {
        return this.monoRepos.get(MonoRepoKind.Azure);
    }

    constructor(
        public readonly resolvedRoot: string,
        services: boolean,
        private readonly logger: Logger = defaultLogger,
    ) {
        const packageManifest = getPackageManifest(resolvedRoot);

        // Expand to full IFluidRepoPackage and full path
        const normalizeEntry = (item: IFluidRepoPackageEntry): IFluidRepoPackage | IFluidRepoPackage[] => {
            if (Array.isArray(item)) {
                return item.map(entry => normalizeEntry(entry) as IFluidRepoPackage);
            }
            if (typeof item === "string") {
                return { directory: path.join(resolvedRoot, item), ignoredDirs: undefined };
            }
            const directory = path.join(resolvedRoot, item.directory);
            return { directory, ignoredDirs: item.ignoredDirs?.map(dir => path.join(directory, dir)) };
        }
        const loadOneEntry = (item: IFluidRepoPackage, group: string) => {
            return Packages.loadDir(item.directory, group, item.ignoredDirs);
        }

        const loadedPackages: Package[] = [];
        for (const group in packageManifest.repoPackages) {
            const item = normalizeEntry(packageManifest.repoPackages[group]);
            if (isMonoRepoKind(group)) {
                const { directory, ignoredDirs } = item as IFluidRepoPackage;
                const monorepo = new MonoRepo(group, directory, ignoredDirs, logger);
                this.monoRepos.set(group, monorepo);
                loadedPackages.push(...monorepo.packages);
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

        if (!this.monoRepos.has(MonoRepoKind.Client)) {
            throw new Error("client entry does not exist in package.json")
        }
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
}
