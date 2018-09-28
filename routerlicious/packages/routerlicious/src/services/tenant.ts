import { GitManager, Historian } from "@prague/services-client";
import * as request from "request-promise-native";
import * as core from "../core";

export class Tenant implements core.ITenant {
    public get id(): string {
        return this.config.id;
    }

    public get gitManager(): GitManager {
        return this.manager;
    }

    public get storage(): core.ITenantStorage {
        return this.config.storage;
    }

    constructor(private config: core.ITenantConfig, private manager: GitManager) {
    }
}

/**
 * Manages a collection of tenants
 */
export class TenantManager implements core.ITenantManager {
    constructor(private endpoint: string, private historianEndpoint: string) {
    }

    public async getTenant(tenantId: string): Promise<core.ITenant> {
        const details = await request.get(
            `${this.endpoint}/api/tenants/${tenantId}`,
            {
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            }) as core.ITenantConfig;

        const historian = new Historian(
            `${this.historianEndpoint}/repos/${encodeURIComponent(tenantId)}`,
            true,
            false);
        const gitManager = new GitManager(historian);
        const tenant = new Tenant(details, gitManager);

        return tenant;
    }

    public async verifyToken(tenantId: string, token: string): Promise<void> {
        await request.post(
            `${this.endpoint}/api/tenants/${encodeURIComponent(tenantId)}/validate`,
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
            `${this.endpoint}/api/tenants/${encodeURIComponent(tenantId)}/key`,
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
