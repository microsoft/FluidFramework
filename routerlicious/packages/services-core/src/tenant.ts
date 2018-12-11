// import { GitManager } from "@prague/services-client";

export interface IAlfredTenant {
    id: string;
    key: string;
}

export interface ITenantConfig {
    id: string;

    storage: ITenantStorage;
}

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

export interface ITenant {
    // TODO KURTB This needs to take in the GitManager/IHistorian/etc... once packages have been split
    gitManager: any;

    storage: ITenantStorage;
}

export interface ITenantManager {
    /**
     * Retrieves details for the given tenant
     */
    getTenant(tenantId: string): Promise<ITenant>;

    /**
     * Verifies that the given auth token is valid. A rejected promise indicaets an invalid token.
     */
    verifyToken(tenantId: string, token: string): Promise<void>;

    /**
     * Retrieves the key for the given tenant. This is a privileged op and should be used with care.
     */
    getKey(tenantId: string): Promise<string>;
}
