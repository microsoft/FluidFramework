import * as request from "request-promise-native";
import * as api from "../api-core";
import { GitManager } from "../git-storage";
import * as clientServices from "../services-client";

export class Tenant implements api.ITenant {
    public get id(): string {
        return this.config.id;
    }

    public get gitManager(): GitManager {
        return this.manager;
    }

    public get storage(): api.ITenantStorage {
        return this.config.storage;
    }

    constructor(private config: api.ITenantConfig, private manager: GitManager) {
    }
}

/**
 * Manages a collection of tenants
 */
export class TenantManager implements api.ITenantManager {
    constructor(private endpoint: string, private historianEndpoint: string) {
    }

    public async getTenant(tenantId: string): Promise<api.ITenant> {
        const details = await request.get(
            `${this.endpoint}/api/tenants/${tenantId}`,
            {
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            }) as api.ITenantConfig;

        const historian = new clientServices.Historian(
            `${this.historianEndpoint}/repos/${tenantId}`,
            true,
            false);
        const gitManager = new GitManager(historian);
        const tenant = new Tenant(details, gitManager);

        return tenant;
    }

    public async verifyToken(tenantId: string, token: string): Promise<void> {
        await request.post(
            `${this.endpoint}/api/tenants/${tenantId}/validate`,
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

    public async getKey(tenantId: string): Promise<string> {
        const key = await request.get(
            `${this.endpoint}/api/tenants/${tenantId}/key`,
            {
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            }) as string;
        return key;
    }
}
