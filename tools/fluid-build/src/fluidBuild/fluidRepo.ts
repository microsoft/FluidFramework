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
import { FluidPackageCheck } from "./fluidPackageCheck";
import { FluidRepoBase } from "../common/fluidRepoBase";
import { MonoRepoKind } from "../common/monoRepo";
import { NpmDepChecker } from "./npmDepChecker";
import { ISymlinkOptions, symlinkPackage } from "./symlinkUtils";
import { BuildGraph } from "./buildGraph";
import { logVerbose } from "../common/logging";
import { MonoRepo } from "../common/monoRepo";

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

        const matchMonoRepo = options.server? MonoRepoKind.Server : MonoRepoKind.Client;
        return this.matchWithFilter(pkg => this.getMonoRepo(pkg) == matchMonoRepo);
    }

    public async checkPackages(fix: boolean) {
        for (const pkg of this.packages.packages) {
            if (FluidPackageCheck.checkScripts(this, pkg, fix)) {
                await pkg.savePackageJson();
            }
            await FluidPackageCheck.checkNpmIgnore(pkg, fix);
            await FluidPackageCheck.checkTsConfig(pkg, fix);
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
        // Only do parallel if we are checking only
        const result = await this.packages.forEachAsync(pkg => symlinkPackage(this, pkg, this.createPackageMap(), options), !options.symlink);
        return result.reduce((sum, value) => sum + value);
    }

    public createBuildGraph(options: ISymlinkOptions, buildScriptNames: string[]) {
        return new BuildGraph(this.packages.packages, buildScriptNames,
            (pkg: Package) => {
                return (dep: Package) => {
                    return options.fullSymlink || MonoRepo.isSame(pkg.monoRepo, dep.monoRepo);
                }
            });
    }

    private matchWithFilter(callback: (pkg: Package) => boolean) {
        let matched = false;
        this.packages.packages.forEach((pkg) => {
            if (!pkg.matched && callback(pkg)) {
                logVerbose(`${pkg.nameColored}: matched`);
                pkg.setMatched();
                matched = true;
            }
        });
        return matched;
    }
};

