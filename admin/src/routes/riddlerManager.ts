import * as request from "request-promise-native";

export interface ITenantStorage {
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
}

export interface ITenantConfig {
    id: string;

    storage: ITenantStorage;
}

/**
 * Manages api calls to riddler
 */
export class RiddlerManager {
    constructor(private endpoint: string) {
    }

    public async getTenant(tenantId: string): Promise<ITenantConfig> {
        const tenantConfig = await request.get(
            `${this.endpoint}/api/tenants/${tenantId}`,
            {
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            }) as ITenantConfig;

        return tenantConfig;
    }

    public async addTenant(): Promise<ITenantConfig & {key: string; }> {
        const tenant = await request.post(
            `${this.endpoint}/api/tenants`,
            {
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            }) as ITenantConfig & {key: string; };
        return tenant;
    }

    public async updateTenantStorage(tenantId: string, storage: any): Promise<void> {
        await request.put(
            `${this.endpoint}/api/tenants/${tenantId}/storage`,
            {
                body: storage,
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            },
        );
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
