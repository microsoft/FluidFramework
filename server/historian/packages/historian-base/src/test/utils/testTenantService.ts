/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITenantConfig } from "@fluidframework/server-services-core";
import { TestDb, TestTenant } from "@fluidframework/server-test-utils";
import { ITenantService } from "../../services";

export class TestTenantService implements ITenantService {
    private readonly tenant = new TestTenant("http://test", "http://historian", new TestDb({}));

    async getTenant(tenantId: string, token: string, includeDisabledTenant = false): Promise<ITenantConfig> {
        return Promise.resolve({
            id: "testTenant",
            storage: this.tenant.storage,
            orderer: this.tenant.orderer,
            customData: {},
        });
    }

    async deleteFromCache(tenantId: string, token: string): Promise<boolean> {
        return Promise.reject(new Error("Method not implemented."));
    }
}
