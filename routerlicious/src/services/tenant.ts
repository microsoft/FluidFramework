import * as request from "request-promise-native";
import * as api from "../api-core";
import { getOrCreateRepository, GitManager } from "../git-storage";
import * as clientServices from "../services-client";

export class Tenant implements api.ITenant {
    public static async Load(config: api.ITenantConfig): Promise<Tenant> {
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

    public get storage(): api.ITenantStorage {
        return this.config.storage;
    }

    private constructor(private config: api.ITenantConfig, private manager: GitManager) {
    }
}

/**
 * Manages a collection of tenants
 */
export class TenantManager implements api.ITenantManager {
    constructor(private endpoint: string) {
    }

    public async getTenant(tenantId: string): Promise<api.ITenant> {
        const details = await request.get(`${this.endpoint}/api/tenants/${tenantId}`) as api.ITenantConfig;
        const tenant = await Tenant.Load(details);

        return tenant;
    }

    public async verifyToken(tenantId: string, token: string): Promise<void> {
        await request.post(
            `${this.endpoint}/tenants/${tenantId}/validate`,
            {
                body: {
                    token,
                },
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            });
    }
}
