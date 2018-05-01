import * as crypto from "crypto";
import * as jwt from "jsonwebtoken";
import * as _ from "lodash";
import { ITenantConfig, ITenantStorage } from "../api-core";
import * as utils from "../utils";

export interface ITenantStorageDocument {
    // Historian backed URL to the storage provider
    url: string;

    // Direct access URL to the storage provider
    direct: string;

    // Storage provider owner
    owner: string;

    // Storage provider repository
    repository: string;

    // Access credentials to the storage provider
    credentials: {
        // User accessing the storage provider
        user: string;

        // Password for the storage provider
        password: string;
    };
};

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
    storage: ITenantStorageDocument;
}

export class TenantManager {
    constructor(private mongoManager: utils.MongoManager, private collectionName: string) {
    }

    /**
     * Validates a tenant's API token
     */
    public async validateToken(tenantId: string, token: string): Promise<void> {
        const key = await this.getTenantKey(tenantId);

        return new Promise<void>((resolve, reject) => {
            jwt.verify(token, key, (error) => {
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
            storage: tenant.storage,
        };
    }

    /**
     * Creates a new tenant
     */
    public async createTenant(): Promise<ITenantConfig & { key: string }> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);

        const key = crypto.randomBytes(16).toString("hex");
        const id = await collection.insertOne({
            _id: utils.getRandomName("-"),
            key,
            storage: null,
        });

        const tenant = await this.getTenant(id);
        return _.extend(tenant, { key });
    }

    /**
     * Updates the tenant configured storage provider
     */
    public async updateStorage(tenantId: string, storage: any): Promise<ITenantStorage> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDocument>(this.collectionName);

        await collection.update({ _id: tenantId }, { storage }, null);

        return (await this.getTenantDocument(tenantId)).storage;
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
        return found;
    }
}
