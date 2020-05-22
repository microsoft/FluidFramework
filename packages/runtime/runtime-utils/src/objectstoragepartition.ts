/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IObjectStorageService } from "@fluidframework/component-runtime-definitions";

/**
 * Returns a new IObjectStorageService that resolves the given `path` as root.
 */
export class ObjectStoragePartition implements IObjectStorageService {
    constructor(private readonly storage: IObjectStorageService, private readonly path: string) {
        // `path` must not include the trailing separator.
        assert(!path.endsWith("/"));
    }

    public async read(path: string): Promise<string> {
        return this.storage.read(`${this.path}/${path}`);
    }
}
