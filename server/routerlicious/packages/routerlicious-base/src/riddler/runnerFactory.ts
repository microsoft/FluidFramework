/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as services from "@fluidframework/server-services";
import { getOrCreateRepository } from "@fluidframework/server-services-client";
import { BaseTelemetryProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import {
    MongoManager,
    IDb,
    ISecretManager,
    IResources,
    IResourcesFactory,
    IRunner,
    IRunnerFactory,
    IWebServerFactory,
} from "@fluidframework/server-services-core";
import * as utils from "@fluidframework/server-services-utils";
import { Provider } from "nconf";
import * as winston from "winston";
import { RiddlerRunner } from "./runner";
import { ITenantDocument } from "./tenantManager";

export class RiddlerResources implements IResources {
    public webServerFactory: IWebServerFactory;

    constructor(
        public readonly config: Provider,
        public readonly tenantsCollectionName: string,
        public readonly mongoManager: MongoManager,
        public readonly port: any,
        public readonly loggerFormat: string,
        public readonly baseOrdererUrl: string,
        public readonly defaultHistorianUrl: string,
        public readonly defaultInternalHistorianUrl: string,
        public readonly secretManager: ISecretManager,
    ) {
        const httpServerConfig: services.IHttpServerConfig = config.get("system:httpServer");
        this.webServerFactory = new services.BasicWebServerFactory(httpServerConfig);
    }

    public async dispose(): Promise<void> {
        await this.mongoManager.close();
    }
}

export class RiddlerResourcesFactory implements IResourcesFactory<RiddlerResources> {
    public async create(config: Provider): Promise<RiddlerResources> {
        // Database connection
        const mongoUrl = config.get("mongo:operationsDbEndpoint") as string;
        const bufferMaxEntries = config.get("mongo:bufferMaxEntries") as number | undefined;
        const operationsDbMongoFactory = new services.MongoDbFactory(mongoUrl, bufferMaxEntries);
        const operationsDbMongoManager = new MongoManager(operationsDbMongoFactory);
        const tenantsCollectionName = config.get("mongo:collectionNames:tenants");
        const secretManager = new services.SecretManager();

        // Load configs for default tenants
        let globalDbMongoManager;
        const globalDbEnabled = config.get("mongo:globalDbEnabled") as boolean;
        if (globalDbEnabled) {
            const globalDbMongoUrl = config.get("mongo:globalDbEndpoint") as string;
            const globalDbMongoFactory = new services.MongoDbFactory(globalDbMongoUrl, bufferMaxEntries);
            globalDbMongoManager = new MongoManager(globalDbMongoFactory);
        }

        const mongoManager = globalDbEnabled ? globalDbMongoManager : operationsDbMongoManager;
        const db: IDb = await mongoManager.getDatabase();

        const collection = db.collection<ITenantDocument>(tenantsCollectionName);
        const tenants = config.get("tenantConfig") as any[];
        const upsertP = tenants.map(async (tenant) => {
            tenant.key = secretManager.encryptSecret(tenant.key);
            await collection.upsert({ _id: tenant._id }, tenant, null);

            // Skip creating anything with credentials - we assume this is external to us and something we can't
            // or don't want to automatically create (i.e. GitHub)
            if (!tenant.storage.credentials) {
                try {
                    await getOrCreateRepository(tenant.storage.url, tenant.storage.owner, tenant.storage.repository);
                } catch (err) {
                    // This is okay to fail since the repos are alreay created in production.
                    winston.error(`Error creating repos`);
                    Lumberjack.error(`Error creating repos`, { [BaseTelemetryProperties.tenantId]: tenant._id }, err);
                }
            }
        });
        await Promise.all(upsertP);

        const loggerFormat = config.get("logger:morganFormat");
        const port = utils.normalizePort(process.env.PORT || "5000");
        const serverUrl = config.get("worker:serverUrl");
        const defaultHistorianUrl = config.get("worker:blobStorageUrl");
        const defaultInternalHistorianUrl = config.get("worker:internalBlobStorageUrl") || defaultHistorianUrl;

        return new RiddlerResources(
            config,
            tenantsCollectionName,
            mongoManager,
            port,
            loggerFormat,
            serverUrl,
            defaultHistorianUrl,
            defaultInternalHistorianUrl,
            secretManager);
    }
}

export class RiddlerRunnerFactory implements IRunnerFactory<RiddlerResources> {
    public async create(resources: RiddlerResources): Promise<IRunner> {
        return new RiddlerRunner(
            resources.webServerFactory,
            resources.tenantsCollectionName,
            resources.port,
            resources.mongoManager,
            resources.loggerFormat,
            resources.baseOrdererUrl,
            resources.defaultHistorianUrl,
            resources.defaultInternalHistorianUrl,
            resources.secretManager);
    }
}
