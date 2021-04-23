/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITenantManager } from "@fluidframework/server-services-core";
import { IUser, ScopeType } from "@fluidframework/protocol-definitions";
// In this case we want @types/express-serve-static-core, not express-serve-static-core, and so disable the lint rule
// eslint-disable-next-line import/no-unresolved
import { Params } from "express-serve-static-core";
import * as _ from "lodash";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { generateToken } from "@fluidframework/server-services-utils";

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
        updatedConfig.blobStorageUrl = `${tenant.storage.url}/${tenant.storage.owner}/${tenant.storage.repository}`;
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

export function getParam(params: Params, key: string) {
    return Array.isArray(params) ? undefined : params[key];
}

/**
 * Helper function to convert Request's query param to a number.
 * @param value - The value to be converted to number.
 */
export function queryParamToNumber(value: any): number {
    if (typeof value !== "string") { return undefined; }
    const parsedValue = parseInt(value, 10);
    return isNaN(parsedValue) ? undefined : parsedValue;
}

/**
 * Helper function to convert Request's query param to a string.
 * @param value - The value to be converted to number.
 */
export function queryParamToString(value: any): string {
    if (typeof value !== "string") { return undefined; }
    return value;
}
