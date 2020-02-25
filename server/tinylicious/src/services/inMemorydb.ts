/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ICollection, IDb } from "@microsoft/fluid-server-services-core";
import { Collection } from "./inMemorycollection";

export class InMemoryDb extends EventEmitter implements IDb {
    private readonly collections = new Map<string, Collection<any>>();

    public async close(): Promise<void> {
        return;
    }

    public collection<T>(name: string): ICollection<T> {
        if (!this.collections.has(name)) {
            const collection = new Collection();
            this.collections.set(name, collection);
        }

        return this.collections.get(name);
    }
}
