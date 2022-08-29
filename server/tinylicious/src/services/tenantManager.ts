/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ITenant,
    ITenantConfig,
    ITenantManager,
    ITenantOrderer,
    ITenantStorage,
} from "@fluidframework/server-services-core";
import { GitManager, Historian } from "@fluidframework/server-services-client";

export class TinyliciousTenant implements ITenant {
    private readonly owner = "tinylicious";
    private readonly repository = "tinylicious";
    private readonly manager: GitManager;

    constructor(
        private readonly url: string,
        private readonly historianUrl: string) {
        const historian = new Historian(historianUrl, false, false);
        this.manager = new GitManager(historian);
    }

    public get gitManager(): GitManager {
        return this.manager;
    }

    public get storage(): ITenantStorage {
        return {
            historianUrl: this.historianUrl,
            internalHistorianUrl: this.historianUrl,
            credentials: null,
            owner: this.owner,
            repository: this.repository,
            url: this.url,
        };
    }

    public get orderer(): ITenantOrderer {
        return {
            type: "kafka",
            url: this.url,
        };
    }
}

export class TenantManager implements ITenantManager {
    constructor(private readonly url: string) {
    }

    public async createTenant(tenantId?: string): Promise<ITenantConfig & { key: string; }> {
        throw new Error("Method not implemented.");
    }

    public getTenant(tenantId: string): Promise<ITenant> {
        return Promise.resolve(
            new TinyliciousTenant(this.url, `${this.url}/repos/${encodeURIComponent(tenantId)}`));
    }

    public async verifyToken(tenantId: string, token: string): Promise<void> {
        return;
    }

    public getKey(tenantId: string): Promise<string> {
        throw new Error("Method not implemented.");
    }
}
