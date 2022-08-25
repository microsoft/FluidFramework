/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { GitManager } from "@fluidframework/server-services-client";
import {
    ITenant,
    ITenantManager,
    ITenantOrderer,
    ITenantStorage,
    IDb,
    ITenantConfig,
} from "@fluidframework/server-services-core";
import { TestHistorian } from "./testHistorian";
import { TestDb } from "./testCollection";

export class TestTenant implements ITenant {
    private readonly owner = "test";
    private readonly repository = "test";
    private readonly manager: GitManager;

    constructor(private readonly url: string, private readonly historianUrl: string, db: IDb) {
        const testHistorian = new TestHistorian(db);
        this.manager = new GitManager(testHistorian);
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

export class TestTenantManager implements ITenantManager {
    private readonly tenant: TestTenant;

    constructor(url = "http://test", historian = "http://historian", testDb: IDb = new TestDb({})) {
        this.tenant = new TestTenant(url, historian, testDb);
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public createTenant(id?: string): Promise<ITenantConfig & { key: string; }> {
        return Promise.resolve({
            id: "test-tenant",
            storage: this.tenant.storage,
            orderer: this.tenant.orderer,
            key: "test-tenant-key",
            customData: {},
        });
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public verifyToken(token: string): Promise<void> {
        return Promise.resolve();
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public getTenant(id: string): Promise<ITenant> {
        return Promise.resolve(this.tenant);
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public getKey(tenantId: string): Promise<string> {
        return Promise.resolve("test");
    }
}
