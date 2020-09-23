/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as services from "@fluidframework/server-services";
import { getOrCreateRepository } from "@fluidframework/server-services-client";
import { MongoManager, ISecretManager } from "@fluidframework/server-services-core";
import * as utils from "@fluidframework/server-services-utils";
import { Provider } from "nconf";
import * as winston from "winston";
import { RiddlerRunner } from "./runner";
import { ITenantDocument } from "./tenantManager";

export class RiddlerResources implements utils.IResources {
    constructor(
        public readonly tenantsCollectionName: string,
        public readonly mongoManager: MongoManager,
        public readonly port: any,
        public readonly loggerFormat: string,
        public readonly baseOrdererUrl: string,
        public readonly defaultHistorianUrl: string,
        public readonly defaultInternalHistorianUrl: string,
        public readonly secretManager: ISecretManager,
    ) {
    }

    public async dispose(): Promise<void> {
        await this.mongoManager.close();
    }
}

export class RiddlerResourcesFactory implements utils.IResourcesFactory<RiddlerResources> {
    public async create(config: Provider): Promise<RiddlerResources> {
        // Database connection
        const mongoUrl = config.get("mongo:endpoint") as string;
        const mongoFactory = new services.MongoDbFactory(mongoUrl);
        const mongoManager = new MongoManager(mongoFactory);
        const tenantsCollectionName = config.get("mongo:collectionNames:tenants");
        const secretManager = new services.SecretManager();

        // Load configs for default tenants
        const db = await mongoManager.getDatabase();
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

export class RiddlerRunnerFactory implements utils.IRunnerFactory<RiddlerResources> {
    public async create(resources: RiddlerResources): Promise<utils.IRunner> {
        return new RiddlerRunner(
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
