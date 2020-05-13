/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import core from "@microsoft/fluid-server-services-core";
import moniker from "moniker";
import request from "request-promise-native";
import { IOrderer, ITenant, ITenantInput, ITenantStorage } from "./definitions";
import { ITenantConfig, RiddlerManager} from "./riddlerManager";

/**
 * User -> Orgs mapping document
 */
export interface IUserOrg {
    // Database ID for the user (provided by AAD)
    _id: string;

    // List of orgIds the userId belongs to.
    orgIds: string[];
}

/**
 * Org -> Tenant mapping document
 */
export interface IOrgTenant {
    // Database ID for the org.
    _id: string;

    // List of tenants for the org.
    tenantIds: string[];
}

/**
 * Tenant document
 */
export interface ITenantDetails {
    // Database ID for the tenant.
    _id: string;

    // Friendly name for the tenant.
    name: string;

    // Deleted flag.
    deleted: boolean;

    // Type of storage
    storage: string;
}

export class TenantManager {
    private riddlerManager: RiddlerManager;

    constructor(
        private mongoManager: core.MongoManager,
        private userOrgCollection: string,
        private orgTenantCollection: string,
        private tenantCollection: string,
        private riddlerEndpoint: string,
        private gitrestEndpoint: string,
        private cobaltEndpoint: string,
        private historianEndpoint: string,
        private alfredEndpoint: string,
        private jarvisEndpoint: string) {

        this.riddlerManager = new RiddlerManager(this.riddlerEndpoint);
    }

    /**
     * Add tenant for this user
     */
    public async addTenant(userId: string, inputParams: ITenantInput): Promise<ITenant> {
        let orgId = await this.getOrgIdForUser(userId);
        if (orgId === null) {
            orgId = await this.createOrgIdForUser(userId);
            await this.createEmptyTenantListForOrg(orgId);
        }

        const newTenant = await this.riddlerManager.addTenant();
        const key = newTenant.key;

        // create the tenant storage
        const orderer = this.createTenantOrderer(newTenant.id, inputParams.ordererType);
        const storage = await this.createTenantStorage(newTenant.id, inputParams);

        const tenantUpdateP = this.riddlerManager.updateTenantStorage(newTenant.id, storage);
        const ordererUpdateP = this.riddlerManager.updateTenantOrderer(newTenant.id, orderer);
        await Promise.all([tenantUpdateP, ordererUpdateP]);

        const tenant = await this.riddlerManager.getTenant(newTenant.id);

        await this.addNewTenantForOrg(orgId, newTenant.id);
        const details = await this.addToTenantDB(
            tenant.id,
            inputParams.name,
            inputParams.storageType);

        return this.convertToITenant(details, tenant, key);
    }

    /**
     * Retrieves the list of tenants for an userId
     */
    public async getTenantsforUser(userId: string): Promise<ITenant[]> {
        const orgId = await this.getOrgIdForUser(userId);
        if (orgId === null) {
            return [];
        }

        const tenantIds = await this.getTenantIdsForOrg(orgId);
        if (tenantIds === null) {
            return [];
        }

        const tenantDetails = await this.getTenantDetails(tenantIds);
        const tenants = tenantDetails.map(async (details) => {
            const tenantP = this.riddlerManager.getTenant(details._id);
            const keyP = this.riddlerManager.getKey(details._id);
            const [tenant, key] = await Promise.all([tenantP, keyP]);

            return this.convertToITenant(details, tenant, key);
        });

        return Promise.all(tenants);
    }

    /**
     * Deletes the tenant from DB. Note that deleting means only changing the flag.
     * The tenant will still be valid to use.
     */
    public async deleteTenant(tenantId: string): Promise<string> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDetails>(this.tenantCollection);
        await collection.update({ _id: tenantId }, { deleted: true }, null);
        return tenantId;
    }

    /**
     * Helper function to convert to an ITenant which wraps both the admin information as well
     * as that information that is stored in Riddler
     */
    private convertToITenant(details: ITenantDetails, tenant: ITenantConfig, key: string): ITenant {
        return {
            deleted: details.deleted,
            historianUrl: this.historianEndpoint,
            id: tenant.id,
            key,
            name: details.name,
            orderer: tenant.orderer,
            provider: this.getProviderForEndpoint(tenant.storage.url),
            storage: tenant.storage,
        };
    }

    private createTenantOrderer(tenantId: string, type: string): IOrderer {
        const url = type === "kafka2" ? this.jarvisEndpoint : this.alfredEndpoint;
        return { type, url };
    }

    /**
     * Creates a repository for each tenant inside the target storage provier.
     * For github provider, tenants are responsible for creating the repo manually.
     */
    private async createTenantStorage(tenantId: string, params: ITenantInput): Promise<ITenantStorage> {
        let storageEndpoint = null;
        let owner = null;
        let repository = null;
        let credentials: { user: string, password: string} = null;

        if (params.storageType !== "github") {
            storageEndpoint = params.storageType === "git" ? this.gitrestEndpoint : this.cobaltEndpoint;
            owner = "prague";
            repository = tenantId;

            await request.post(
                `${storageEndpoint}/${owner}/repos`,
                {
                    body: {
                        name: tenantId,
                    },
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                    },
                    json: true,
                });
        } else {
            storageEndpoint = "https://api.github.com";
            owner = params.owner;
            repository = params.repository;
            credentials = {
                password: params.password,
                user: params.username,
            };
        }

        return {
            credentials,
            direct: storageEndpoint,
            owner,
            repository,
            url: storageEndpoint,
        };
    }

    private getProviderForEndpoint(url: string) {
        if (!url) {
            return "Unknown";
        }

        if (url.indexOf(this.cobaltEndpoint) !== -1) {
            return "Cobalt";
        } else if (url.indexOf(this.gitrestEndpoint) !== -1) {
            return "Git";
        } else if (url.indexOf("https://api.github.com") !== -1) {
            return "GitHub";
        } else {
            return "Unknown";
        }
    }

    private async createOrgIdForUser(userId: string): Promise<string> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<IUserOrg>(this.userOrgCollection);
        const orgId = moniker.choose();
        await collection.insertOne({
            _id: userId,
            orgIds: [orgId],
        });
        return orgId;
    }

    private async createEmptyTenantListForOrg(orgId: string): Promise<void> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<IOrgTenant>(this.orgTenantCollection);
        await collection.insertOne({
            _id: orgId,
            tenantIds: [],
        });
    }

    private async addNewTenantForOrg(orgId: string, tenantId: string): Promise<void> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<IOrgTenant>(this.orgTenantCollection);
        const existingTenants = (await collection.findOne({_id: orgId})).tenantIds;
        existingTenants.push(tenantId);
        await collection.update({ _id: orgId }, { tenantIds: existingTenants }, null);
    }

    private async addToTenantDB(id: string, name: string, storage: string): Promise<ITenantDetails> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDetails>(this.tenantCollection);
        const newTenant: ITenantDetails = {
            _id: id,
            deleted: false,
            name,
            storage,
        };
        await collection.insertOne(newTenant);
        return newTenant;
    }

    private async getOrgIdForUser(userId: string): Promise<string> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<IUserOrg>(this.userOrgCollection);

        const found = await collection.findOne({ _id: userId });
        return (found === null) ? null : found.orgIds[0];
    }

    private async getTenantIdsForOrg(orgId: string): Promise<string[]> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<IOrgTenant>(this.orgTenantCollection);

        const found = await collection.findOne({ _id: orgId });
        return (found === null) ? null : found.tenantIds;
    }

    private async getTenantDetails(tenantIds: string[]): Promise<ITenantDetails[]> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenantDetails>(this.tenantCollection);
        const found = await collection.find(
            { $and: [{_id: {$in: tenantIds}}, {deleted: false}]},
            {},
        );
        return found;
    }

}
