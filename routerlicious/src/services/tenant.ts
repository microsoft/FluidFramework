import { ITenant, ITenantConfig, ITenantManager, ITenantStorage } from "../api-core";
import { ICollection } from "../core";
import { getOrCreateRepository, GitManager } from "../git-storage";
import * as clientServices from "../services-client";
import * as utils from "../utils";

export class Tenant implements ITenant {
    public static async Load(config: ITenantConfig): Promise<Tenant> {
        const historian = new clientServices.Historian(config.storage.url, true, false);
        const gitManager = await getOrCreateRepository(
            historian,
            config.storage.url,
            config.storage.owner,
            config.storage.repository);

        return new Tenant(config, gitManager);
    }

    public get id(): string {
        return this.config.id;
    }

    public get gitManager(): GitManager {
        return this.manager;
    }

    public get storage(): ITenantStorage {
        return this.config.storage;
    }

    private constructor(private config: ITenantConfig, private manager: GitManager) {
    }
}

/**
 * Manages a collection of tenants
 */
export class TenantManager implements ITenantManager {
    public static async Load(
        mongoManager: utils.MongoManager,
        config: ITenantConfig[],
        tenantsCollectionName: string): Promise<TenantManager> {

        const tenantsP = new Array<Promise<Tenant>>();
        for (const tenant of config) {
            const tenantP = Tenant.Load(tenant);
            tenantsP.push(tenantP);
        }
        const tenants = await Promise.all(tenantsP);
        const db = await mongoManager.getDatabase();
        const tenantsCollection = await db.collection<ITenantConfig>(tenantsCollectionName);

        // Initialize the tenant manager
        const manager = new TenantManager(tenants, tenantsCollection);

        return manager;
    }

    private tenants = new Map<string, Tenant>();
    private defaultTenant: Tenant;

    private constructor(tenants: Tenant[], private collection: ICollection<ITenantConfig>) {

        for (const tenant of tenants) {
            this.tenants.set(tenant.id, tenant);
        }
        this.defaultTenant = tenants[0]
    }

    public async getTenant(tenantId: string): Promise<ITenant> {
        if (!tenantId) {
            return this.defaultTenant;
        }

        if (!this.tenants.has(tenantId)) {
            const config = await this.collection.findOne({ name });
            if (!config) {
                return Promise.reject("Invaid tenant name");
            }

            const tenant = await Tenant.Load(config);
            this.tenants.set(tenant.id, tenant);
        }

        return this.tenants.get(tenantId);
    }
}
