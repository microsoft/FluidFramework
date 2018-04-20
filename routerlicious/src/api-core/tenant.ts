import { GitManager } from "../git-storage";

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

export interface ITenant {
    gitManager: GitManager;

    storage: ITenantStorage;
}

export interface ITenantManager {
    getTenant(tenantid: string): Promise<ITenant>;
}
