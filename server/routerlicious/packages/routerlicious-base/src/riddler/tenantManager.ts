/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as crypto from "crypto";
import {
    ITenantConfig,
    ITenantCustomData,
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

    // Custom data for tenant extensibility
    customData: ITenantCustomData;

    // Whether the tenant is disabled
    disabled: boolean;
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
            customData: tenant.customData,
        };
    }

    /**
     * Retrieves the details for all tenants
     */
    public async getAllTenants(): Promise<ITenantConfig[]> {
        const tenants = await this.getAllTenantDocuments();

        return tenants.map((tenant) => ({
            id: tenant._id,
            orderer: tenant.orderer,
            storage: tenant.storage,
            customData: tenant.customData,
        }));
    }

    private generateTenantKey(): string {
        return crypto.randomBytes(16).toString("hex");
    }

    /**
     * Creates a new tenant
     */
    public async createTenant(
        tenantId?: string,
        customData?: ITenantCustomData,
    ): Promise<ITenantConfig & { key: string }> {
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
            customData: customData || {},
            disabled: false,
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

    /**
     * Updates the tenant configured orderer
     */
    public async updateOrderer(tenantId: string, orderer: ITenantOrderer): Promise<ITenantOrderer> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);

        await collection.update({ _id: tenantId }, { orderer }, null);

        return (await this.getTenantDocument(tenantId)).orderer;
    }

    /**
     * Updates the tenant custom data fields
     */
    public async updateCustomData(tenantId: string, customData: ITenantCustomData): Promise<ITenantCustomData> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);

        const customDataUpdateDoc = {};
        Object.entries(customData).forEach(([key, value]) => {
            customDataUpdateDoc[`customData.${key}`] = value;
        });

        await collection.update({ _id: tenantId }, customDataUpdateDoc, null);

        return (await this.getTenantDocument(tenantId)).orderer;
    }

    /**
     * Retrieves the secret for the given tenant
     */
    public async getTenantKey(tenantId: string): Promise<string> {
        const encryptedTenantKey = (await this.getTenantDocument(tenantId)).key;
        const tenantKey = this.secretManager.decryptSecret(encryptedTenantKey);
        if (tenantKey == null) {
            winston.error("Tenant key decryption failed.");
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            Promise.reject("Tenant key decryption failed.");
        }

        return tenantKey;
    }

    /**
     * Generates a new key for a tenant
     */
    public async refreshTenantKey(tenantId: string): Promise<string> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);

        const key = this.generateTenantKey();

        await collection.update({ _id: tenantId }, { key }, null);

        return (await this.getTenantDocument(tenantId)).key;
    }

    /**
     * Attaches fields to older tenants to provide backwards compatibility
     */
    private attachOrdererAndStorageToTenantDocument(tenantDocument: ITenantDocument): void {
        // Ordering information was historically not included with the tenant. In the case where it is empty
        // we default it to the kafka orderer at the base server URL.
        if (!tenantDocument.orderer) {
            tenantDocument.orderer = {
                type: "kafka",
                url: this.baseOrdererUrl,
            };
        }

        // Older tenants did not include the historian endpoint in their storage configuration since this
        // was always assumed to be a static value.
        if (tenantDocument.storage && !tenantDocument.storage.historianUrl) {
            tenantDocument.storage.historianUrl = this.defaultHistorianUrl;
            tenantDocument.storage.internalHistorianUrl = this.defaultInternalHistorianUrl;
        }

        // Older tenants do not include the custom data object. Setting it as an empty object
        // avoids errors down the line.
        if (!tenantDocument.customData) {
            tenantDocument.customData = {};
        }
    }

    /**
     * Retrieves the raw database tenant document
     */
    private async getTenantDocument(tenantId: string): Promise<ITenantDocument> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);

        const found = await collection.findOne({ _id: tenantId });
        if (found.disabled) {
            throw new Error("Tenant is disabled");
        }

        this.attachOrdererAndStorageToTenantDocument(found);

        return found;
    }

    /**
     * Retrieves all the raw database tenant documents
     */
    public async getAllTenantDocuments(): Promise<ITenantDocument[]> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);

        const allFound = await collection.findAll();

        allFound.forEach((found) => {
            this.attachOrdererAndStorageToTenantDocument(found);
        });

        return allFound.filter((found) => !found.disabled);
    }

    /**
     * Flags the given tenant as disabled
     */
    public async disableTenant(tenantId: string): Promise<void> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);

        await collection.update({ _id: tenantId }, { disabled: true }, null);
    }
}
