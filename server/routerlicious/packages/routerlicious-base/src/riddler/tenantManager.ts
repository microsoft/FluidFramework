/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
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
        const tenantKey = await this.getTenantKey(tenantId, includeDisabledTenant);

        return new Promise<void>((resolve, reject) => {
            jwt.verify(token, tenantKey, (error) => {
                if (error) {
                    // When `exp` claim exists in token claims, jsonwebtoken verifies token expiration.
                    reject(error instanceof jwt.TokenExpiredError
                        ? new NetworkError(401, "Token expired.")
                        : new NetworkError(403, "Invalid token."));
                } else {
                    resolve();
                }
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
            return Promise.reject(new Error("Tenant is disabled or does not exist."));
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
    ): Promise<ITenantConfig & { key: string }> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);

        const tenantKey = this.generateTenantKey();
        const encryptedTenantKey = this.secretManager.encryptSecret(tenantKey);
        if (encryptedTenantKey == null) {
            winston.error("Tenant key encryption failed.");
            Lumberjack.error("Tenant key encryption failed.", { [BaseTelemetryProperties.tenantId]: tenantId });
            return Promise.reject(new Error("Tenant key encryption failed."));
        }

        const id = await collection.insertOne({
            _id: tenantId,
            key: encryptedTenantKey,
            orderer,
            storage,
            customData,
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
    public async getTenantKey(tenantId: string, includeDisabledTenant = false): Promise<string> {
        const encryptedTenantKey = (await this.getTenantDocument(tenantId, includeDisabledTenant)).key;
        const tenantKey = this.secretManager.decryptSecret(encryptedTenantKey);
        if (tenantKey == null) {
            winston.error("Tenant key decryption failed.");
            Lumberjack.error("Tenant key decryption failed.", { [BaseTelemetryProperties.tenantId]: tenantId });
            return Promise.reject(new Error("Tenant key decryption failed."));
        }

        return tenantKey;
    }

    /**
     * Generates a new key for a tenant
     */
    public async refreshTenantKey(tenantId: string): Promise<string> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);

        const tenantKey = this.generateTenantKey();
        const encryptedTenantKey = this.secretManager.encryptSecret(tenantKey);
        if (encryptedTenantKey == null) {
            winston.error("Tenant key encryption failed.");
            Lumberjack.error("Tenant key encryption failed.", { [BaseTelemetryProperties.tenantId]: tenantId });
            return Promise.reject(new Error("Tenant key encryption failed."));
        }

        await collection.update({ _id: tenantId }, { key: encryptedTenantKey }, null);

        return tenantKey;
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
        if (found.disabled && !includeDisabledTenant) {
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
     * @param tenantId: Id of the tenant to delete.
     * @param scheduledDeletionTimeTime: If present, indicates when to hard-delete the tenant.
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return accessInfo;
    }
}
