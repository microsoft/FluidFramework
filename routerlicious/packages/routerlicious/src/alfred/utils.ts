import { IUser } from "@prague/runtime-definitions";
import { IAlfredTenant, ITenantManager } from "@prague/services-core";
import { generateToken } from "@prague/services-core";
import * as _ from "lodash";

/**
 * Helper function to return tenant specific configuration
 */
export async function getConfig(
    config: any,
    tenantManager: ITenantManager,
    tenantId: string,
    trackError: boolean,
    client: any,
    direct = false): Promise<string> {

    // Make a copy of the config to avoid destructive modifications to the original
    const updatedConfig = _.cloneDeep(config);
    updatedConfig.tenantId = tenantId;
    updatedConfig.trackError = trackError;
    updatedConfig.client = client;

    if (direct) {
        const tenant = await tenantManager.getTenant(tenantId);
        updatedConfig.credentials = tenant.storage.credentials;
        updatedConfig.blobStorageUrl = `${tenant.storage.direct}/${tenant.storage.owner}/${tenant.storage.repository}`;
        updatedConfig.historianApi = false;
    } else {
        updatedConfig.blobStorageUrl = updatedConfig.blobStorageUrl.replace("historian:3000", "localhost:3001");
        updatedConfig.historianApi = true;
    }

    return JSON.stringify(updatedConfig);
}

export function getToken(tenantId: string, documentId: string, tenants: IAlfredTenant[], user?: IUser): string {
    for (const tenant of tenants) {
        if (tenantId === tenant.id) {
            return generateToken(tenantId, documentId, tenant.key, user);
        }
    }

    throw new Error("Invalid tenant");
}
