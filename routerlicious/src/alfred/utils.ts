import * as _ from "lodash";
import { ITenantManager } from "../api-core";

/**
 * Helper function to return tenant specific configuration
 */
export async function getConfig(
    config: any,
    tenantManager: ITenantManager,
    tenantId: string,
    direct = false): Promise<string> {

    // Make a copy of the config to avoid destructive modifications to the original
    const updatedConfig = _.cloneDeep(config);

    const tenant = await tenantManager.getTenant(tenantId).catch((err) => {
        return Promise.reject(err);
    });
    updatedConfig.owner = tenant.storage.owner;
    updatedConfig.repository = tenant.storage.repository;

    if (direct) {
        updatedConfig.credentials = tenant.storage.credentials;
        updatedConfig.blobStorageUrl = tenant.storage.direct;
        updatedConfig.historianApi = false;
    } else {
        updatedConfig.blobStorageUrl = tenant.storage.url;
        updatedConfig.historianApi = true;
    }

    return JSON.stringify(updatedConfig);
}

/**
 * Helper function to return the composite identifier that combines a tenant id and a document id
 */
export function getFullId(tenantId: string, documentId: string): string {
    return tenantId ? `${tenantId}/${documentId}` : documentId;
}
