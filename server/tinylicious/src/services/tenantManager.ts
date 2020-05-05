/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITenant, ITenantManager } from "@microsoft/fluid-server-services-core";

export class TenantManager implements ITenantManager {
    public getTenant(tenantId: string): Promise<ITenant> {
        throw new Error("Method not implemented.");
    }

    public async verifyToken(tenantId: string, token: string): Promise<void> {
        return;
    }

    public getKey(tenantId: string): Promise<string> {
        throw new Error("Method not implemented.");
    }
}
