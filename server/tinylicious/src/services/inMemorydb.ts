/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ICollection, IDb, IDbFactory } from "@fluidframework/server-services-core";
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

    public async dropCollection(name: string): Promise<boolean> {
        if (!this.collections.has(name)) {
            return true;
        }
        this.collections.delete(name);
        return true;
    }
}

export class InMemoryDbFactory implements IDbFactory {
    private readonly db: InMemoryDb;

    constructor() {
        this.db = new InMemoryDb();
    }

    public async connect(): Promise<IDb> {
        return this.db;
    }
}
