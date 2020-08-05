/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IChannelStorageService } from "@fluidframework/datastore-definitions";

/**
 * Returns a new IChannelStorageService that resolves the given `path` as root.
 */
export class ObjectStoragePartition implements IChannelStorageService {
    constructor(private readonly storage: IChannelStorageService, private readonly path: string) {
        // `path` must not include the trailing separator.
        assert(!path.endsWith("/"));
    }

    public async read(path: string): Promise<string> {
        return this.storage.read(`${this.path}/${path}`);
    }

    public async contains(path: string): Promise<boolean> {
        return this.storage.contains(`${this.path}/${path}`);
    }

    public async list(path: string): Promise<string[]> {
        return this.storage.list(`${this.path}/${path}`);
    }
}
