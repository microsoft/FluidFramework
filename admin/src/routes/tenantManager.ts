import * as moniker from "moniker";
import * as request from "request-promise-native";
import * as core from "../db";
import { ITenantStorage, RiddlerManager} from "./riddlerManager";

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
export interface ITenant {
    // Database ID for the tenant.
    _id: string;

    // Friendly name for the tenant.
    name: string;

    // Deleted flag.
    deleted: boolean;

    // Key for the tenant
    key: string;

    // Tenant storage
    storage: ITenantStorage;
}

export class TenantManager {

    private riddlerManager: RiddlerManager;

    constructor(private mongoManager: core.MongoManager, private userOrgCollection: string,
                private orgTenantCollection: string, private tenantCollection: string,
                private riddlerEndpoint: string, private gitrestEndpoint: string, private cobaltEndpoint: string) {
                    this.riddlerManager = new RiddlerManager(this.riddlerEndpoint);
    }

    /**
     * Add tenant for this user
     */
    public async addTenant(userId: string, name: string, storage: any): Promise<ITenant> {
        let orgId = await this.getOrgIdForUser(userId);
        if (orgId === null) {
            orgId = await this.createOrgIdForUser(userId);
            await this.createEmptyTenantListForOrg(orgId);
        }

        const newTenant = await this.riddlerManager.addTenant();
        const key = newTenant.key;
        await this.riddlerManager.updateTenantStorage(newTenant.id, storage);
        await this.createRepoForTenant(newTenant.id, storage.name);
        const dbTenant = await this.riddlerManager.getTenant(newTenant.id);

        await this.addNewTenantForOrg(orgId, newTenant.id);

        const tenant = await this.addToTenantDB(dbTenant.id, key, name, dbTenant.storage);
        return tenant;
    }

    /**
     * Retrieves the list of tenants for an userId
     */
    public async getTenantsforUser(userId: string): Promise<ITenant[]> {
        const orgId = await this.getOrgIdForUser(userId);
        if (orgId === null) { return []; }
        const tenantIds = await this.getTenantIdsForOrg(orgId);
        if (tenantIds === null) { return []; }
        const tenants = this.getTenants(tenantIds);
        return tenants;
    }

    /**
     * Deletes the tenant from DB. Note that deleting means only changing the flag.
     * The tenant will still be valid to use.
     */
    public async deleteTenant(tenantId: string): Promise<string> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenant>(this.tenantCollection);
        await collection.update({ _id: tenantId }, { deleted: true }, null);
        return tenantId;
    }

    /**
     * Creates a repository for each tenant inside the target storage provier.
     * For github provider, tenants are responsible for creating the repo manually.
     */
    private async createRepoForTenant(tenantId: string, providerName: string) {
        if (providerName !== "github") {
            const storageEndpoint = (providerName === "git") ? this.gitrestEndpoint : this.cobaltEndpoint;
            await request.post(
                `${storageEndpoint}/prague/repos`,
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

    private async addToTenantDB(id: string, key: string, name: string, storage: ITenantStorage): Promise<ITenant> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenant>(this.tenantCollection);
        const newTenant: ITenant = {
            _id: id,
            deleted: false,
            key,
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

    private async getTenants(tenantIds: string[]): Promise<ITenant[]> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenant>(this.tenantCollection);
        const found = await collection.find(
            { $and: [{_id: {$in: tenantIds}}, {deleted: false}]},
            {},
        );
        return found;
    }

}
