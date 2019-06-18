/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { GitManager } from "@prague/services-client";
import { ITenant, ITenantManager, ITenantOrderer, ITenantStorage } from "@prague/services-core";
import { TestHistorian } from "./testHistorian";

export class TestTenant implements ITenant {
    private owner = "test";
    private repository = "test";
    private manager: GitManager;

    constructor(private url: string) {
        const testHistorian = new TestHistorian();
        this.manager = new GitManager(testHistorian);
    }

    public get gitManager(): GitManager {
        return this.manager;
    }

    public get storage(): ITenantStorage {
        return {
            credentials: null,
            direct: null,
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
    private tenant: TestTenant;

    constructor(url = "http://test") {
        this.tenant = new TestTenant(url);
    }

    public verifyToken(token: string): Promise<void> {
        return Promise.resolve();
    }

    public getTenant(id: string): Promise<ITenant> {
        return Promise.resolve(this.tenant);
    }

    public getKey(tenantId: string): Promise<string> {
        return Promise.resolve("test");
    }
}
