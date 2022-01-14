/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DbFactoryFactory } from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import { LevelDbFactory } from "./levelDb";
import { InMemoryDbFactory } from "./inMemorydb";

export class TinyliciousDbFactoryFactory extends DbFactoryFactory {
    constructor(config: Provider) {
        const defaultBackend = config.get("db:inMemory") ? "InMemoryDb" : "LevelDb";
        super(config, [
            { name: "LevelDb", factory: async () => new LevelDbFactory(config.get("db:path")) },
            { name: "InMemoryDb", factory: async () => new InMemoryDbFactory() },
        ], defaultBackend);
    }
}
