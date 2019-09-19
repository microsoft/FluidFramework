/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IServiceConfiguration, IUser, ScopeType } from "@microsoft/fluid-protocol-definitions";
import { generateToken, IAlfredTenant, ITenantManager } from "@microsoft/fluid-server-services-core";
// In this case we want @types/express-serve-static-core, not express-serve-static-core, and so disable the lint rule
// tslint:disable-next-line:no-implicit-dependencies
import { Params } from "express-serve-static-core";
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

export function getToken(tenantId: string, documentId: string, tenants: IAlfredTenant[], user?: IAlfredUser): string {
    const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
    for (const tenant of tenants) {
        if (tenantId === tenant.id) {
            return generateToken(tenantId, documentId, tenant.key, scopes, user);
        }
    }

    throw new Error("Invalid tenant");
}

export interface IAlfredUser extends IUser {
    displayName: string;
    name: string;
}

export const DefaultServiceConfiguration: IServiceConfiguration = {
    blockSize: 64436,
    maxMessageSize:  16 * 1024,
    summary: {
        idleTime: 5000,
        maxOps: 1000,
        maxTime: 5000 * 12,
    },
};

export function getParam(params: Params, key: string) {
    return Array.isArray(params) ? undefined : params[key];
}
