/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    GitManager,
    Historian,
    ICredentials,
    BasicRestWrapper,
    getAuthorizationTokenFromCredentials,
} from "@fluidframework/server-services-client";
import { generateToken, getCorrelationId } from "@fluidframework/server-services-utils";
import * as core from "@fluidframework/server-services-core";
import { fromUtf8ToBase64 } from "@fluidframework/common-utils";

export class Tenant implements core.ITenant {
    public get id(): string {
        return this.config.id;
    }

    public get gitManager(): GitManager {
        return this.manager;
    }

    public get storage(): core.ITenantStorage {
        return this.config.storage;
    }

    public get orderer(): core.ITenantOrderer {
        return this.config.orderer;
    }

    constructor(private readonly config: core.ITenantConfig, private readonly manager: GitManager) {
    }
}

/**
 * Manages a collection of tenants
 */
export class TenantManager implements core.ITenantManager {
    constructor(private readonly endpoint: string, private readonly internalHistorianUrl: string) {
    }

    public async createTenant(tenantId?: string): Promise<core.ITenantConfig & { key: string; }> {
        const restWrapper = new BasicRestWrapper();
        const result = await restWrapper.post<core.ITenantConfig & { key: string; }>(
            `${this.endpoint}/api/tenants/${encodeURIComponent(tenantId || "")}`,
            undefined,
        );
        return result;
    }

    public async getTenant(tenantId: string, documentId: string, includeDisabledTenant = false): Promise<core.ITenant> {
        const restWrapper = new BasicRestWrapper();
        const [details, key] = await Promise.all([
            restWrapper.get<core.ITenantConfig>(`${this.endpoint}/api/tenants/${tenantId}`,
            { includeDisabledTenant }),
            this.getKey(tenantId, includeDisabledTenant)]);

        const defaultQueryString = {
            token: fromUtf8ToBase64(`${tenantId}`),
        };
        const getDefaultHeaders = () => {
            const credentials: ICredentials = {
                password: generateToken(tenantId, documentId, key, null),
                user: tenantId,
            };
            return ({
                Authorization: getAuthorizationTokenFromCredentials(credentials),
            });
        };
        const defaultHeaders = getDefaultHeaders();
        const baseUrl = `${this.internalHistorianUrl}/repos/${encodeURIComponent(tenantId)}`;
        const tenantRestWrapper = new BasicRestWrapper(
            baseUrl,
            defaultQueryString,
            undefined,
            undefined,
            defaultHeaders,
            undefined,
            undefined,
            getDefaultHeaders,
            getCorrelationId);
        const historian = new Historian(
            `${this.internalHistorianUrl}/repos/${encodeURIComponent(tenantId)}`,
            true,
            false,
            tenantRestWrapper);
        const gitManager = new GitManager(historian);
        const tenant = new Tenant(details, gitManager);

        return tenant;
    }

    public async verifyToken(tenantId: string, token: string): Promise<void> {
        const restWrapper = new BasicRestWrapper();
        await restWrapper.post(
            `${this.endpoint}/api/tenants/${encodeURIComponent(tenantId)}/validate`,
            { token });
    }

    public async getKey(tenantId: string, includeDisabledTenant = false): Promise<string> {
        const restWrapper = new BasicRestWrapper();
        const result = await restWrapper.get<core.ITenantKeys>(
            `${this.endpoint}/api/tenants/${encodeURIComponent(tenantId)}/keys`,
            { includeDisabledTenant },
        );
        return result.key1;
    }
}
