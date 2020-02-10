/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { GitManager } from "@microsoft/fluid-server-services-client";
import { ITenant, ITenantManager, ITenantOrderer, ITenantStorage } from "@microsoft/fluid-server-services-core";
import { TestHistorian } from "./testHistorian";

export class TestTenant implements ITenant {
    private readonly owner = "test";
    private readonly repository = "test";
    private readonly manager: GitManager;

    constructor(private readonly url: string, private readonly historianUrl: string) {
        const testHistorian = new TestHistorian();
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

    constructor(url = "http://test", historian = "http://historian") {
        this.tenant = new TestTenant(url, historian);
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
