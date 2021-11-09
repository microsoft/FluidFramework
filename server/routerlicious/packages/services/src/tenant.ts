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
import Axios from "axios";
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
    constructor(private readonly endpoint: string) {
    }

    public async createTenant(tenantId?: string): Promise<core.ITenantConfig & { key: string }> {
        const result = await Axios.post<core.ITenantConfig & { key: string }>(
            `${this.endpoint}/api/tenants/${encodeURIComponent(tenantId || "")}`);
        return result.data;
    }

    public async getTenant(tenantId: string, documentId: string, includeDisabledTenant = false): Promise<core.ITenant> {
        const [details, key] = await Promise.all([
            Axios.get<core.ITenantConfig>(`${this.endpoint}/api/tenants/${tenantId}`,
            { params: { includeDisabledTenant }}),
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
        const baseUrl = `${details.data.storage.internalHistorianUrl}/repos/${encodeURIComponent(tenantId)}`;
        const restWrapper = new BasicRestWrapper(
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
            `${details.data.storage.internalHistorianUrl}/repos/${encodeURIComponent(tenantId)}`,
            true,
            false,
            restWrapper);
        const gitManager = new GitManager(historian);
        const tenant = new Tenant(details.data, gitManager);

        return tenant;
    }

    public async verifyToken(tenantId: string, token: string): Promise<void> {
        await Axios.post(
            `${this.endpoint}/api/tenants/${encodeURIComponent(tenantId)}/validate`,
            { token });
    }

    public async getKey(tenantId: string, includeDisabledTenant = false): Promise<string> {
        const result = await Axios.get(
            `${this.endpoint}/api/tenants/${encodeURIComponent(tenantId)}/key`,
            { params: { includeDisabledTenant }});
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return result.data;
    }
}
