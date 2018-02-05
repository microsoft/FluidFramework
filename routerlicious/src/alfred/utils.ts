import * as _ from "lodash";
import { ITenantManager } from "../api-core";

/**
 * Helper functioin to return tenant specific configuration
 */
export function getConfig(config: any, tenantManager: ITenantManager, tenantId: string): string {
    // Make a copy of the config to avoid destructive modifications to the original
    const updatedConfig = _.cloneDeep(config);

    const tenant = tenantManager.getTenant(tenantId);
    updatedConfig.blobStorageUrl = tenant.storage.publicUrl;
    updatedConfig.owner = tenant.storage.owner;
    updatedConfig.repository = tenant.storage.repository;

    return JSON.stringify(updatedConfig);
}

/**
 * Helper function to return the composite identifier that combines a tenant id and a document id
 */
export function getFullId(tenantId: string, documentId: string): string {
    return tenantId ? `${tenantId}/${documentId}` : documentId;
}
