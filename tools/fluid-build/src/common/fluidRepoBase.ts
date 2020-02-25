/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { Packages } from "./npmPackage";

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
};