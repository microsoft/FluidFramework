/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IObjectStorageService } from "@microsoft/fluid-runtime-definitions";

export const enum SnapshotPath {
    rows = "rows",
    cols = "cols",
    cells = "cells"
}

export class ContentObjectStorage implements IObjectStorageService {
    constructor(private readonly storage: IObjectStorageService, private readonly path: SnapshotPath) {}

    public async read(path: string): Promise<string> {
        return this.storage.read(`${this.path}/${path}`);
    }
}
