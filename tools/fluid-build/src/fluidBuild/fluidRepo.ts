/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { Package, Packages } from "../common/npmPackage";
import {
    globFn,
    rimrafWithErrorAsync,
    ExecAsyncResult,
    execWithErrorAsync,
} from "../common/utils";
import { FluidPackageCheck, MonoRepo } from "./fluidPackageCheck";
import { FluidRepoBase } from "../common/fluidRepoBase";
import { NpmDepChecker } from "./npmDepChecker";
import { ISymlinkOptions, symlinkPackage } from "./symlinkUtils";
import { BuildGraph } from "./buildGraph";

export interface IPackageMatchedOptions {
    match: string[];
    all: boolean;
    server: boolean;
};

export class FluidRepo extends FluidRepoBase {

    private readonly packageInstallDirectories = [
        path.join(this.resolvedRoot, "common/build/build-common"),
        path.join(this.resolvedRoot, "common/build/eslint-config-fluid"),
        path.join(this.resolvedRoot, "common/lib/common-definitions"),
        path.join(this.resolvedRoot, "common/lib/common-utils"),
    ];
    private readonly monoReposInstallDirectories = [
        path.join(this.resolvedRoot),
        this.serverDirectory,
    ];

    constructor(resolvedRoot: string) {
        super(resolvedRoot);
    }

    public async clean() {
        return Packages.clean(this.packages.packages, false);
    }

    public getMonoRepo(pkg: Package) {
        return pkg.directory.startsWith(this.serverDirectory) ? MonoRepo.Server :
            pkg.directory.startsWith(this.clientDirectory) || pkg.directory.startsWith(this.exampleDirectory) ? MonoRepo.Client : MonoRepo.None
    }

    public isSameMonoRepo(monoRepo: MonoRepo, pkg: Package) {
        return monoRepo !== MonoRepo.None && monoRepo === this.getMonoRepo(pkg);
    }

    public getMonoRepoNodeModePath(monoRepo: MonoRepo) {
        switch (monoRepo) {
            case MonoRepo.Client:
                return path.join(this.clientDirectory, "..", "node_modules");
            case MonoRepo.Server:
                return path.join(this.serverDirectory, "..", "node_modules");
            default:
                return undefined;
        }
    }
    public async install(nohoist: boolean) {
        if (nohoist) {
            return this.packages.noHoistInstall(this.resolvedRoot);
        }
        const installScript = "npm i";
        const installPromises: Promise<ExecAsyncResult>[] = [];
        for (const dir of [...this.packageInstallDirectories, ...this.monoReposInstallDirectories]) {
            installPromises.push(execWithErrorAsync(installScript, { cwd: dir }, dir));
        }
        const rets = await Promise.all(installPromises);

        return !rets.some(ret => ret.error);
    }

    public async uninstall() {
        const cleanPackageNodeModules = this.packages.cleanNodeModules();
        const removePromise = Promise.all(
            this.monoReposInstallDirectories.map(dir => rimrafWithErrorAsync(path.join(dir, "node_modules"), dir))
        );

        const r = await Promise.all([cleanPackageNodeModules, removePromise]);
        return r[0] && !r[1].some(ret => ret.error);
    };

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

        if (options.server) {
            return this.matchWithFilter(pkg => pkg.directory.startsWith(this.serverDirectory));
        }

        // Default to client and example packages
        return this.matchWithFilter(
            pkg => pkg.directory.startsWith(this.clientDirectory) || pkg.directory.startsWith(this.exampleDirectory)
        );
    }

    public async checkScripts(fix: boolean) {
        for (const pkg of this.packages.packages) {
            FluidPackageCheck.checkScripts(this, pkg, fix);
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
        const packageMap = new Map<string, Package>(this.packages.packages.map(pkg => [pkg.name, pkg]));
        // Only do parallel if we are checking only
        const result = await this.packages.forEachAsync(pkg => symlinkPackage(this, pkg, packageMap, options), !options.symlink);
        return result.reduce((sum, value) => sum + value);
    }

    public createBuildGraph(options: ISymlinkOptions, buildScript: string) {
        return new BuildGraph(this.packages.packages, buildScript,
            (pkg: Package) => {
                const monoRepo = this.getMonoRepo(pkg);
                return (dep: Package) => {
                    return options.fullSymlink || this.isSameMonoRepo(monoRepo, dep);
                }
            });
    }

    private matchWithFilter(callback: (pkg: Package) => boolean) {
        let matched = false;
        this.packages.packages.forEach((pkg) => {
            if (callback(pkg)) {
                pkg.setMatched();
                matched = true;
            }
        });
        return matched;
    }
};

