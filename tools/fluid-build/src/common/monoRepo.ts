/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Package, Packages } from "./npmPackage";
import * as path from "path";

export enum MonoRepoKind {
    None,
    Client,
    Server,
};

export class MonoRepo {
    public readonly packages: Package[];
    constructor(public readonly kind: MonoRepoKind, private dirs: string[]) {
        this.packages = Packages.loadDirs(dirs, this);
    }

    public static isSame(a: MonoRepo | undefined, b: MonoRepo | undefined) {
        return a !== undefined && a === b;
    }

    public getPath() {
        // TODO: Cheating here
        return path.join(this.dirs[0], "..");
    }
    public getNodeModulePath() {
        return path.join(this.getPath(), "node_modules");
    }
};