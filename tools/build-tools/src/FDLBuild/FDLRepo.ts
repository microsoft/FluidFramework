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

export class FDLRepo extends FluidRepoBase {
    public fluidRepoName = FluidRepoName.FDL;

    constructor(resolvedRoot: string, services: boolean) {
        super(resolvedRoot, "server/routerlicious", [
            ...Packages.loadDir(path.join(resolvedRoot, "common")),
            ...Packages.loadDir(path.join(resolvedRoot, "tools/generator-fluid")),
            ...services ?
                Packages.loadDir(path.join(resolvedRoot, "server"), undefined, ["routerlicious"]):
                Packages.loadDir(path.join(resolvedRoot, "server/tinylicious")),
        ]);
    }

    public async uninstall() {
        const cleanPackageNodeModules = this.packages.cleanNodeModules();
        const removePromise = Promise.all(
            [this.clientMonoRepo.uninstall(), this.serverMonoRepo?.uninstall()]
        );

        const r = await Promise.all([cleanPackageNodeModules, removePromise]);
        return r[0] && !r[1].some(ret => ret?.error);
    };
};

