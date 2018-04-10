import * as crypto from "crypto";

export interface ITenant {
    name: string;
    key: string;
    storage: any;
}

function findMatchingStorageTenant(storageName: string, tenantConfig: any[]): any {
    for (const config of tenantConfig) {
        if (config.name === storageName) {
            return config;
        }
    }
    return null;
}

function updateGithubTenant(tenant: any, tenantConfig: any) {
    tenantConfig.storage.owner = tenant.owner;
    tenantConfig.storage.repository = tenant.repository;
    tenantConfig.storage.credentials.user = tenant.username;
    tenantConfig.storage.credentials.password = tenant.password;
}

export function generateTenant(tenant: any, tenantConfigs: any): ITenant {
    const tenantConfig = findMatchingStorageTenant(tenant.storage, tenantConfigs as any[]);
    if (tenantConfig === null) {
        return null;
    } else {
        if (tenant.storage === "github") {
            updateGithubTenant(tenant, tenantConfig);
        }
        return {
            key: crypto.randomBytes(16).toString("hex"),
            name: tenant.name.toLowerCase(),
            storage: tenantConfig,
        };
    }
}
