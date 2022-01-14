/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDbFactory } from "@fluidframework/server-services-core";
import debug from "debug";
import { Provider } from "nconf";
import * as services from "./";

interface IDBFactoryConfig {
    name: string;
    modulePathOrName: string;
    dbFactoryConstructorName: string;
    dbConfig: any;
}

const creator = (dbFactoryConfig: IDBFactoryConfig) => async (): Promise<IDbFactory> => {
    debug(`Using ${dbFactoryConfig.name} Database`);
    const externalDbFactoryModule = await import (dbFactoryConfig.modulePathOrName);
    return new externalDbFactoryModule[dbFactoryConfig.dbFactoryConstructorName](
        dbFactoryConfig.dbConfig,
    ) as Promise<IDbFactory>;
};

export async function getDbFactory(config: Provider): Promise<IDbFactory> {
    const dbFactoryConfig = config.get("db") as IDBFactoryConfig;
    if (!dbFactoryConfig || dbFactoryConfig.name === "mongo") {
        // Taken from current ResourceFactories
        const mongoFactory = new services.MongoDbFactory(config.get("mongo"));
        return mongoFactory;
    }

    if (process.env.LOADEXTENSIONS) {
        const EXTENSIONS = config.get("extensions:db") as IDBFactoryConfig[] || [];
        const extension = EXTENSIONS.find((ext) => ext.name === dbFactoryConfig.name);

        if (extension === undefined) {
            throw Error(`The database ${dbFactoryConfig.name} is not found.`);
        }

        const externalDbFactoryModule = creator(extension)();

        return externalDbFactoryModule;
    }

    throw Error(`Couldn't load database: ${dbFactoryConfig.name}, perhaps you forgot to enable extensions loading?`);
}
