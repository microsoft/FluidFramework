import { GitManager } from "../git-storage";

export interface ITenantStorage {
    url: string;
    publicUrl: string;
    owner: string;
    repository: string;

    /**
     * (optional) Direct access to storage historian is providing cached access to
     */
    direct?: string;
    credentials?: {
        user: string,
        password: string,
    };
}

export interface ITenantConfig {
    name: string;
    key: string;
    storage: ITenantStorage;
    isDefault?: boolean;
}

export interface ITenant {
    gitManager: GitManager;

    storage: ITenantStorage;
}

export interface ITenantManager {
    getTenant(tenantid: string): Promise<ITenant>;
}
