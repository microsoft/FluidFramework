import { GitManager } from "../git-storage";

export interface ITenantStorage {
    url: string;
    publicUrl: string;
    owner: string;
    repository: string;
}

export interface ITenantConfig {
    name: string;
    storage: ITenantStorage;
    isDefault?: boolean;
}

export interface ITenant {
    gitManager: GitManager;

    storage: ITenantStorage;
}

export interface ITenantManager {
    getTenant(tenantid: string): ITenant;
}
