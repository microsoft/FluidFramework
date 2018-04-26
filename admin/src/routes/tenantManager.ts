import * as moniker from "moniker";
import * as core from "../db";
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
    storage: any;
}

export class TenantManager {

    private riddlerManager: RiddlerManager;

    constructor(private mongoManager: core.MongoManager, private userOrgCollection: string,
                private orgTenantCollection: string, private tenantCollection: string,
                private riddlerEndpoint: string) {
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

        const dbTenant = await this.riddlerManager.addTenant();
        await this.riddlerManager.updateTenantStorage(dbTenant.id, storage);

        await this.addNewTenantForOrg(orgId, dbTenant.id);

        const tenant = await this.addToTenantDB(dbTenant, name, storage);
        return tenant;
    }

    /**
     * Retrieves the list of tenants for an userId
     */
    public async getTenantsforUser(userId: string): Promise<ITenant[]> {
        const orgId = await this.getOrgIdForUser(userId);
        if (orgId === null) { return null; }
        const tenantIds = await this.getTenantIdsForOrg(orgId);
        if (tenantIds === null) { return null; }
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

    private async addToTenantDB(tenant: ITenantConfig & {key: string; }, name: string, storage: any): Promise<ITenant> {
        const db = await this.mongoManager.getDatabase();
        const collection = db.collection<ITenant>(this.tenantCollection);
        const newTenant: ITenant = {
            _id: tenant.id,
            deleted: false,
            key: tenant.key,
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

        const idObjects = tenantIds.map((id) => new core.ObjectId(id));
        const found = await collection.find({_id: {$in: idObjects}}, {});
        return found;
    }

}
