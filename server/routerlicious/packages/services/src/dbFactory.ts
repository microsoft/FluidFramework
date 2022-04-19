/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDbFactory } from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { Provider } from "nconf";
import * as services from "./";

interface IDBFactoryConfig {
    name: string;
    modulePathOrName: string;
    dbFactoryConstructorName: string;
    dbConfig: any;
}

const creator = (dbFactoryConfig: IDBFactoryConfig) => async (): Promise<IDbFactory> => {
    Lumberjack.info(`Using ${dbFactoryConfig.name} Database.`);
    // Dynamically load the module
    const externalDbFactoryModule = await import (dbFactoryConfig.modulePathOrName);
    return new externalDbFactoryModule[dbFactoryConfig.dbFactoryConstructorName](
        dbFactoryConfig.dbConfig,
    ) as Promise<IDbFactory>;
};

export async function getDbFactory(config: Provider): Promise<IDbFactory> {
    const dbFactoryConfig = config.get("db") as IDBFactoryConfig;
    // Default handling is Mongo
    if (!dbFactoryConfig || dbFactoryConfig.name === "mongo") {
        const mongoFactory = new services.MongoDbFactory(config.get("mongo"));
        return mongoFactory;
    }

    // We enable extensions loading only when the flag is set to true.
    // The idea behind the flag to have an additional security measure to avoid loading unwanted extensions.
    // @TODO: in the initial proposal it was part of the config file, but perhaps it should be an
    // environment variable instead ?
    if (config.get("loadExtensions") === true) {
        const dbExtensions = config.get("extensions:db") as IDBFactoryConfig[] || [];
        const extension = dbExtensions.find((ext) => ext.name === dbFactoryConfig.name);

        if (extension === undefined) {
            throw new Error(`The database ${dbFactoryConfig.name} is not found.`);
        }

        // Instantiate the corresponding db factory
        const externalDbFactoryModule = creator(extension)();

        return externalDbFactoryModule;
    }

    throw new Error(
        `Couldn't load database: ${dbFactoryConfig.name}, perhaps you forgot to enable extensions loading?`);
}
