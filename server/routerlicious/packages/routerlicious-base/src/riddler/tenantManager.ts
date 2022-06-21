/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as crypto from "crypto";
import {
    ITenantConfig,
    ITenantCustomData,
    ITenantKeys,
    ITenantOrderer,
    ITenantStorage,
    KeyName,
    MongoManager,
    ISecretManager,
} from "@fluidframework/server-services-core";
import { NetworkError } from "@fluidframework/server-services-client";
import { BaseTelemetryProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import * as jwt from "jsonwebtoken";
import * as _ from "lodash";
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

    // second key for the given tenant
    secondaryKey: string;

    // Storage provider details
    storage: ITenantStorage;

    // Orderer details
    orderer: ITenantOrderer;

    // Custom data for tenant extensibility
    customData: ITenantCustomData;

    // Whether the tenant is disabled
    disabled: boolean;

    // Timestamp of when this tenant will be hard deleted.
    // Only applicable if the tenant is disabled.
    scheduledDeletionTime?: string;
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
    public async validateToken(tenantId: string, token: string, includeDisabledTenant = false): Promise<void> {
        const tenantKeys = await this.getTenantKeys(tenantId, includeDisabledTenant);

        return jwt.verify(token, tenantKeys.key1, (error1) => {
            if (!error1) {
                return;
            }

            // if the tenant doesn't have key2, it will be empty string
            // we should fail token generated with empty string as key
            if (!tenantKeys.key2) {
                throw error1 instanceof jwt.TokenExpiredError
                    ? new NetworkError(401, "Token expired validated with key1.")
                    : new NetworkError(403, "Invalid token validated with key1.");
            }

            jwt.verify(token, tenantKeys.key2, (error2) => {
                if (!error2) {
                    return;
                }

                // When `exp` claim exists in token claims, jsonwebtoken verifies token expiration.
                throw (error1 instanceof jwt.TokenExpiredError
                    || error2 instanceof jwt.TokenExpiredError)
                    ? new NetworkError(401, "Token expired validated with both key1 and key2.")
                    : new NetworkError(403, "Invalid token validated with both key1 and key2.");
            });
        });
    }

    /**
     * Retrieves the details for the given tenant
     */
    public async getTenant(tenantId: string, includeDisabledTenant = false): Promise<ITenantConfig> {
        const tenant = await this.getTenantDocument(tenantId, includeDisabledTenant);
        if (!tenant) {
            winston.error("Tenant is disabled or does not exist.");
            Lumberjack.error(
                "Tenant is disabled or does not exist.",
                { [BaseTelemetryProperties.tenantId]: tenantId },
            );
            throw new NetworkError(404, "Tenant is disabled or does not exist.");
        }

        const accessInfo = tenant.customData.externalStorageData?.accessInfo;
        if (accessInfo) {
            tenant.customData.externalStorageData.accessInfo = this.decryptAccessInfo(accessInfo);
        }

        return {
            id: tenant._id,
            orderer: tenant.orderer,
            storage: tenant.storage,
            customData: tenant.customData,
            scheduledDeletionTime: tenant.scheduledDeletionTime,
        };
    }

    /**
     * Retrieves the details for all tenants
     */
    public async getAllTenants(includeDisabledTenant = false): Promise<ITenantConfig[]> {
        const tenants = await this.getAllTenantDocuments(includeDisabledTenant);

        return tenants.map((tenant) => ({
            id: tenant._id,
            orderer: tenant.orderer,
            storage: tenant.storage,
            customData: tenant.customData,
            scheduledDeletionTime: tenant.scheduledDeletionTime,
        }));
    }

    /**
     * Generates a random tenant key
     */
    private generateTenantKey(): string {
        return crypto.randomBytes(16).toString("hex");
    }

    /**
     * Creates a new tenant
     */
    public async createTenant(
        tenantId: string,
        storage: ITenantStorage,
        orderer: ITenantOrderer,
        customData: ITenantCustomData,
    ): Promise<ITenantConfig & { key: string; }> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);

        const tenantKey1 = this.generateTenantKey();
        const encryptedTenantKey1 = this.secretManager.encryptSecret(tenantKey1);
        if (encryptedTenantKey1 == null) {
            winston.error("Tenant key1 encryption failed.");
            Lumberjack.error("Tenant key1 encryption failed.", { [BaseTelemetryProperties.tenantId]: tenantId });
            throw new NetworkError(500, "Tenant key1 encryption failed.");
        }

        const tenantKey2 = this.generateTenantKey();
        const encryptedTenantKey2 = this.secretManager.encryptSecret(tenantKey2);
        if (encryptedTenantKey2 == null) {
            winston.error("Tenant key2 encryption failed.");
            Lumberjack.error("Tenant key2 encryption failed.", { [BaseTelemetryProperties.tenantId]: tenantId });
            throw new NetworkError(500, "Tenant key2 encryption failed.");
        }

        const id = await collection.insertOne({
            _id: tenantId,
            key: encryptedTenantKey1,
            secondaryKey: encryptedTenantKey2,
            orderer,
            storage,
            customData,
            disabled: false,
        });

        const tenant = await this.getTenant(id);
        return _.extend(tenant, { key: tenantKey1, secondaryKey: tenantKey2 });
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
     * Updates the tenant custom data object
     */
    public async updateCustomData(tenantId: string, customData: ITenantCustomData): Promise<ITenantCustomData> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);
        const accessInfo = customData.externalStorageData?.accessInfo;
        if (accessInfo) {
            customData.externalStorageData.accessInfo = this.encryptAccessInfo(accessInfo);
        }
        await collection.update({ _id: tenantId }, { customData }, null);

        return (await this.getTenantDocument(tenantId)).customData;
    }

    /**
     * Retrieves the secret for the given tenant
     */
    public async getTenantKeys(tenantId: string, includeDisabledTenant = false): Promise<ITenantKeys> {
        const tenantDocument = await this.getTenantDocument(tenantId, includeDisabledTenant);

        if (!tenantDocument) {
            winston.error(`No tenant found when retrieving keys for tenant id ${tenantId}`);
            Lumberjack.error(
                `No tenant found when retrieving keys for tenant id ${tenantId}`,
                { [BaseTelemetryProperties.tenantId]: tenantId },
            );
            throw new NetworkError(403, `Tenant, ${tenantId}, does not exist.`);
        }

        const encryptedTenantKey1 = tenantDocument.key;
        const tenantKey1 = this.secretManager.decryptSecret(encryptedTenantKey1);
        if (tenantKey1 == null) {
            winston.error("Tenant key1 decryption failed.");
            Lumberjack.error("Tenant key1 decryption failed.", { [BaseTelemetryProperties.tenantId]: tenantId });
            throw new NetworkError(500, "Tenant key1 decryption failed.");
        }

        const encryptedTenantKey2 = tenantDocument.secondaryKey;
        if (!encryptedTenantKey2) {
            winston.info("Tenant key2 doesn't exist.");
            Lumberjack.info("Tenant key2 doesn't exist.", { [BaseTelemetryProperties.tenantId]: tenantId });
            return {
                key1: tenantKey1,
                key2: "",
            };
        }

        const tenantKey2 = this.secretManager.decryptSecret(encryptedTenantKey2);
        if (tenantKey2 == null) {
            winston.error("Tenant key2 decryption failed.");
            Lumberjack.error("Tenant key2 decryption failed.", { [BaseTelemetryProperties.tenantId]: tenantId });
            throw new NetworkError(500, "Tenant key2 decryption failed.");
        }

        return {
            key1: tenantKey1,
            key2: tenantKey2,
        };
    }

    /**
     * Generates a new key for a tenant
     */
    public async refreshTenantKey(tenantId: string, keyName: string): Promise<ITenantKeys> {
        if (keyName !== KeyName.key1 && keyName !== KeyName.key2) {
            throw new NetworkError(400, "Key name must be either key1 or key2.");
        }

        const tenantDocument = await this.getTenantDocument(tenantId, false);

        const newTenantKey = this.generateTenantKey();
        const encryptedNewTenantKey = this.secretManager.encryptSecret(newTenantKey);
        if (encryptedNewTenantKey == null) {
            winston.error("Tenant key encryption failed.");
            Lumberjack.error("Tenant key encryption failed.", { [BaseTelemetryProperties.tenantId]: tenantId });
            throw new NetworkError(500, "Tenant key encryption failed.");
        }

        const tenantKeys = await this.getUpdatedTenantKeys(
            tenantDocument.key,
            tenantDocument.secondaryKey,
            keyName,
            newTenantKey,
            tenantId);

        const updateKey = keyName === KeyName.key2
            ? { secondaryKey: encryptedNewTenantKey }
            : { key: encryptedNewTenantKey };
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);
        await collection.update({ _id: tenantId }, updateKey, null);

        return tenantKeys;
    }

    /**
     * Gets updated 2 tenant keys after refresh.
     */
    private async getUpdatedTenantKeys(
        key1: string,
        key2: string,
        keyName: string,
        newTenantKey: string,
        tenantId: string,
    ): Promise<ITenantKeys> {
        // if key2 is to be refreshed
        if (keyName === KeyName.key2) {
            const decryptedTenantKey1 = this.secretManager.decryptSecret(key1);
            if (decryptedTenantKey1 == null) {
                winston.error("Tenant key1 decryption failed.");
                Lumberjack.error("Tenant key1 decryption failed.", { [BaseTelemetryProperties.tenantId]: tenantId });
                throw new NetworkError(500, "Tenant key1 decryption failed.");
            }
            return {
                key1: decryptedTenantKey1,
                key2: newTenantKey,
            };
        }

        // below is if key1 is to be refreshed
        // if key2 doesn't exist, no need to decrypt
        if (!key2) {
            winston.info("Tenant key2 doesn't exist.");
            Lumberjack.info("Tenant key2 doesn't exist.", { [BaseTelemetryProperties.tenantId]: tenantId });
            return {
                key1: newTenantKey,
                key2: "",
            };
        }

        // if key2 exists, refresh key1 and return
        const decryptedTenantKey2 = this.secretManager.decryptSecret(key2);
        if (decryptedTenantKey2 == null) {
            winston.error("Tenant key2 decryption failed.");
            Lumberjack.error("Tenant key2 decryption failed.", { [BaseTelemetryProperties.tenantId]: tenantId });
            throw new NetworkError(500, "Tenant key2 decryption failed.");
        }
        return {
            key1: newTenantKey,
            key2: decryptedTenantKey2,
        };
    }

    /**
     * Attaches fields to older tenants to provide backwards compatibility.
     * Will be removed at some point.
     */
    private attachDefaultsToTenantDocument(tenantDocument: ITenantDocument): void {
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
    private async getTenantDocument(tenantId: string, includeDisabledTenant = false): Promise<ITenantDocument> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);

        const found = await collection.findOne({ _id: tenantId });
        if (!found || found.disabled && !includeDisabledTenant) {
            return null;
        }

        this.attachDefaultsToTenantDocument(found);

        return found;
    }

    /**
     * Retrieves all the raw database tenant documents
     */
    private async getAllTenantDocuments(includeDisabledTenant = false): Promise<ITenantDocument[]> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);

        const allFound = await collection.findAll();

        allFound.forEach((found) => {
            this.attachDefaultsToTenantDocument(found);
        });

        return includeDisabledTenant ? allFound : allFound.filter((found) => !found.disabled);
    }

    /**
     * Deletes a tenant
     * @param tenantId - Id of the tenant to delete.
     * @param scheduledDeletionTime - If present, indicates when to hard-delete the tenant.
     * If no scheduledDeletionTime is provided the tenant is only soft-deleted.
     */
    public async deleteTenant(tenantId: string, scheduledDeletionTime?: Date): Promise<void> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);
        const softDelete = !scheduledDeletionTime || scheduledDeletionTime.getTime() > Date.now();
        if (softDelete) {
            const query = {
                _id: tenantId,
                disabled: false,
            };
            await collection.update(query, {
                disabled: true,
                scheduledDeletionTime: scheduledDeletionTime?.toJSON(),
            }, null);
        } else {
            await collection.deleteOne({ _id: tenantId });
        }
    }

    private encryptAccessInfo(accessInfo: any): string {
        const encryptedAccessInfo = this.secretManager.encryptSecret(JSON.stringify(accessInfo));
        return encryptedAccessInfo;
    }

    private decryptAccessInfo(encryptedAccessInfo: string): any {
        const accessInfo = JSON.parse(this.secretManager.decryptSecret(encryptedAccessInfo));
        return accessInfo;
    }
}
