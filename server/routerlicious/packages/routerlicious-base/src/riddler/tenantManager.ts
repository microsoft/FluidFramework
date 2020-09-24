/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as crypto from "crypto";
import {
    ITenantConfig,
    ITenantOrderer,
    ITenantStorage,
    MongoManager,
    ISecretManager,
} from "@fluidframework/server-services-core";
import * as jwt from "jsonwebtoken";
import * as _ from "lodash";
import { getRandomName } from "@fluidframework/server-services-client";
import * as winston from "winston";

/**
 * Tenant details stored to the document database
 */
export interface ITenantDocument {
    // Database ID for the tenant. Id is only marked optional because the database will provide it
    // on initial insert
    _id: string;

    // API key for the given tenant
    key: string;

    // Storage provider details
    storage: ITenantStorage;

    // Orderer details
    orderer: ITenantOrderer;
}

export class TenantManager {
    constructor(
        private readonly mongoManager: MongoManager,
        private readonly collectionName: string,
        private readonly baseOrdererUrl: string,
        private readonly defaultHistorianUrl: string,
        private readonly defaultInternalHistorianUrl: string,
        private readonly secretManager: ISecretManager,
    ) {
    }

    /**
     * Validates a tenant's API token
     */
    public async validateToken(tenantId: string, token: string): Promise<void> {
        const encryptedTenantKey = await this.getTenantKey(tenantId);
        const tenantKey = this.secretManager.decryptSecret(encryptedTenantKey);
        if (tenantKey == null) {
            winston.error("Tenant key decryption failed.");
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            Promise.reject("Tenant key decryption failed.");
        }

        return new Promise<void>((resolve, reject) => {
            jwt.verify(token, tenantKey, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Retrieves the details for the given tenant
     */
    public async getTenant(tenantId: string): Promise<ITenantConfig> {
        const tenant = await this.getTenantDocument(tenantId);

        return {
            id: tenant._id,
            orderer: tenant.orderer,
            storage: tenant.storage,
        };
    }

    /**
     * Creates a new tenant
     */
    public async createTenant(tenantId?: string): Promise<ITenantConfig & { key: string }> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);

        const tenantKey = crypto.randomBytes(16).toString("hex");
        const encryptedTenantKey = this.secretManager.encryptSecret(tenantKey);
        if (encryptedTenantKey == null) {
            winston.error(`Tenant key encryption failed.`);
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            Promise.reject("Tenant key encryption failed.");
        }
        const id = await collection.insertOne({
            _id: tenantId || getRandomName("-"),
            key: encryptedTenantKey,
            orderer: null,
            storage: null,
        });

        const tenant = await this.getTenant(id);
        return _.extend(tenant, { key: tenantKey });
    }

    /**
     * Updates the tenant configured storage provider
     */
    public async updateStorage(tenantId: string, storage: ITenantStorage): Promise<ITenantStorage> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);

        await collection.update({ _id: tenantId }, { storage }, null);

        return (await this.getTenantDocument(tenantId)).storage;
    }

    public async updateOrderer(tenantId: string, orderer: ITenantOrderer): Promise<ITenantOrderer> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);

        await collection.update({ _id: tenantId }, { orderer }, null);

        return (await this.getTenantDocument(tenantId)).orderer;
    }

    /**
     * Retrieves the secret for the given tenant
     */
    public async getTenantKey(tenantId: string): Promise<string> {
        return (await this.getTenantDocument(tenantId)).key;
    }

    /**
     * Retrieves the raw databasse tenant document
     */
    private async getTenantDocument(tenantId: string): Promise<ITenantDocument> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);

        const found = await collection.findOne({ _id: tenantId });

        // Ordering information was historically not included with the tenant. In the case where it is empty
        // we default it to the kafka orderer at the base server URL.
        if (!found.orderer) {
            found.orderer = {
                type: "kafka",
                url: this.baseOrdererUrl,
            };
        }

        // Older tenants did not include the historian endpoint in their storage configuration since this
        // was always assumed to be a static value.
        if (found.storage && !found.storage.historianUrl) {
            found.storage.historianUrl = this.defaultHistorianUrl;
            found.storage.internalHistorianUrl = this.defaultInternalHistorianUrl;
        }

        return found;
    }
}
