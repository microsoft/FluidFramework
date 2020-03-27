/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Package, Packages } from "./npmPackage";

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
};