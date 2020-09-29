/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDb, IDbFactory } from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import { InMemoryDb } from "./inMemorydb";
import { LevelDb } from "./levelDb";

export class DbFactory implements IDbFactory {
    private readonly db;

    constructor(config: Provider) {
        this.db = config.get("db:inMemory") ? new InMemoryDb() : new LevelDb(config.get("db:path"));
    }

    public async connect(): Promise<IDb> {
        return this.db;
    }
}
