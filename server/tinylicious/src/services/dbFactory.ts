/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DbFactoryFactory } from "@fluidframework/server-services-core";
import { Provider } from "nconf";

export class TinyliciousDbFactoryFactory extends DbFactoryFactory {
    constructor(config: Provider) {
        const defaultBackend = config.get("db:inMemory") ? "InMemoryDb" : "LevelDb";
        super(config, [
            { name: "LevelDb", path: "./levelDb", config: config.get("db:path"), factory: "LevelDbFactory" },
            { name: "InMemoryDb", path: "./inMemorydb", config: undefined, factory: "InMemoryDbFactory" },
        ], defaultBackend);
    }
}
