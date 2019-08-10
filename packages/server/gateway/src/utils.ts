/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser, ScopeType } from "@prague/protocol-definitions";
import { generateToken, IAlfredTenant } from "@prague/services-core";
import * as _ from "lodash";

export interface IAlfredUser extends IUser {
    displayName: string;
    name: string;
}

export interface ICachedPackage {
    entrypoint: string;
    scripts: Array<{ id: string, url: string }>;
}

/**
 * Helper function to return tenant specific configuration
 */
export function getConfig(
    config: any,
    tenantId: string,
    trackError: boolean,
): string {
    // Make a copy of the config to avoid destructive modifications to the original
    const updatedConfig = _.cloneDeep(config);
    updatedConfig.tenantId = tenantId;
    updatedConfig.trackError = trackError;
    updatedConfig.client = {
        permission: [],
        type: "browser",
    };
    updatedConfig.blobStorageUrl = updatedConfig.blobStorageUrl.replace("historian:3000", "localhost:3001");
    updatedConfig.historianApi = true;

    return JSON.stringify(updatedConfig);
}

export function getToken(
    tenantId: string,
    documentId: string,
    tenants: IAlfredTenant[],
    scopes: ScopeType[],
    user?: IAlfredUser): string {
    for (const tenant of tenants) {
        if (tenantId === tenant.id) {
            return generateToken(tenantId, documentId, tenant.key, scopes, user);
        }
    }

    throw new Error("Invalid tenant");
}
