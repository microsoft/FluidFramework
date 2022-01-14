/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Provider } from "nconf";
import registerDebug from "debug";
import { IDbFactory } from "./database";

export interface IDatabaseDescriptor {
    name: string // name of the database
    factory: () => Promise<IDbFactory> // name of the constructor
}

export interface IDatabaseConfig {
    path: string, // Path of the module to load
    config: any, // configuration that will be passed into the constructor
    name: string // name of the database
    factory: string // name of the constructor
}
const creator = (descriptor: IDatabaseConfig) => async () => {
    debug(`Using ${descriptor.name} Database`);
    const extension = await import(`${descriptor.path}`);
    const thingyFactory = extension[descriptor.factory];
    return new thingyFactory(descriptor.config) as IDbFactory;
};

const debug = registerDebug("fluid:database");

export class DbFactoryFactory {
    private readonly databases: Map<string, () => Promise<IDbFactory>>;

    constructor(config: Provider, dbServices: IDatabaseDescriptor[], private readonly defaultDatabase: string) {
        const availableDbs: Map<string, () => Promise<IDbFactory>> = new Map(
            dbServices.map((desc) => [desc.name, desc.factory]),
        );

        if (config.get('loadExtensions')) {
            const EXTENSIONS = config.get("extensions:db") as IBackendConfig[] || [];
            EXTENSIONS.forEach((ext) => {
                availableDbs.set(ext.name, creator(ext));
            });
        }

        debug("Available DBs:", availableDbs.keys());

        this.databases = availableDbs;
    }
    async create(databaseOverride?: string): Promise<IDbFactory> {
        const db = databaseOverride || this.defaultDatabase;

        if (this.databases.has(db)) {
            return this.databases.get(db)();
        } else {
            throw new Error(`Unknown database specified: ${db}`);
        }
    }
}
