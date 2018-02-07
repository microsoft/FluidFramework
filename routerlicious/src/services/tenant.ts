import { ITenant, ITenantConfig, ITenantManager, ITenantStorage } from "../api-core";
import { getOrCreateRepository, GitManager } from "../git-storage";
import * as clientServices from "../services-client";

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

    public get name(): string {
        return this.config.name;
    }

    public get gitManager(): GitManager {
        return this.manager;
    }

    public get storage(): ITenantStorage {
        return this.config.storage;
    }

    private constructor(private config: ITenantConfig, private manager: GitManager) {
    }

    public isDefault(): boolean {
        return this.config.isDefault === true;
    }
}

/**
 * Manages a collection of tenants
 */
export class TenantManager implements ITenantManager {
    public static async Load(config: ITenantConfig[]): Promise<TenantManager> {
        const tenantsP = new Array<Promise<Tenant>>();
        for (const tenant of config) {
            const tenantP = Tenant.Load(tenant);
            tenantsP.push(tenantP);
        }
        const tenants = await Promise.all(tenantsP);

        // Initialize the tenant manager
        const manager = new TenantManager(tenants);

        return manager;
    }

    private tenants = new Map<string, Tenant>();
    private defaultTenant: Tenant;

    private constructor(tenants: Tenant[]) {
        for (const tenant of tenants) {
            this.tenants.set(tenant.name, tenant);
            this.defaultTenant = tenant.isDefault() ? tenant : this.defaultTenant;
        }
    }

    public getTenant(tenantId: string): ITenant {
        return tenantId ? this.tenants.get(tenantId) : this.defaultTenant;
    }
}
