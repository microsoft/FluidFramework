/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { GitManager, Historian } from "@microsoft/fluid-server-services-client";
import * as core from "@microsoft/fluid-server-services-core";
import Axios from "axios";

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

    public async getTenant(tenantId: string): Promise<core.ITenant> {
        const details = await Axios.get<core.ITenantConfig>(`${this.endpoint}/api/tenants/${tenantId}`);
        const historian = new Historian(
            `${details.data.storage.internalHistorianUrl}/repos/${encodeURIComponent(tenantId)}`,
            true,
            false);
        const gitManager = new GitManager(historian);
        const tenant = new Tenant(details.data, gitManager);

        return tenant;
    }

    public async verifyToken(tenantId: string, token: string): Promise<void> {
        await Axios.post(
            `${this.endpoint}/api/tenants/${encodeURIComponent(tenantId)}/validate`,
            { token });
    }

    public async getKey(tenantId: string): Promise<string> {
        const result = await Axios.get(`${this.endpoint}/api/tenants/${encodeURIComponent(tenantId)}/key`);
        return result.data;
    }
}
