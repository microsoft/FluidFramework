/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { Packages } from "../common/npmPackage";
import { FluidPackageCheck } from "../common/build/fluidPackageCheck";
import { FluidRepoBase, FluidRepoName } from "../common/fluidRepoBase";
import { MonoRepoKind } from "../common/monoRepo";
import { MonoRepo } from "../common/monoRepo";

export class FluidRepo extends FluidRepoBase {
    public fluidRepoName = FluidRepoName.FDL;

    public readonly serverMonoRepo: MonoRepo;

    constructor(resolvedRoot: string, services: boolean) {
        super(resolvedRoot);
        this.serverMonoRepo = new MonoRepo(MonoRepoKind.Server, path.join(this.resolvedRoot, "server/routerlicious"));
        this.packages = new Packages(
            [
                ...Packages.loadDir(path.join(this.resolvedRoot, "common")),
                ...this.serverMonoRepo.packages,
                ...this.clientMonoRepo.packages,
                ...Packages.loadDir(path.join(this.resolvedRoot, "tools/generator-fluid")),
                ...services ?
                    Packages.loadDir(path.join(this.resolvedRoot, "server"), undefined, ["routerlicious"]):
                    Packages.loadDir(path.join(this.resolvedRoot, "server/tinylicious")),

            ]
        );
    }

    public async uninstall() {
        const cleanPackageNodeModules = this.packages.cleanNodeModules();
        const removePromise = Promise.all(
            [this.clientMonoRepo.uninstall(), this.serverMonoRepo.uninstall()]
        );

        const r = await Promise.all([cleanPackageNodeModules, removePromise]);
        return r[0] && !r[1].some(ret => ret.error);
    };

    public async checkPackages(fix: boolean) {
        for (const pkg of this.packages.packages) {
            if (FluidPackageCheck.checkScripts(pkg, fix)) {
                await pkg.savePackageJson();
            }
            await FluidPackageCheck.checkNpmIgnore(pkg, fix);
            await FluidPackageCheck.checkTsConfig(pkg, fix);
        }
    }
};

