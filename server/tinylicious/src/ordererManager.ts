/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    LocalOrderManager,
} from "@microsoft/fluid-server-memory-orderer";
import * as core from "@microsoft/fluid-server-services-core";
import * as winston from "winston";

export class OrdererManager implements core.IOrdererManager {
    constructor(
        private ordererUrl: string,
        private tenantManager: core.ITenantManager,
        private localOrderManager: LocalOrderManager,
    ) {
    }

    public async getOrderer(tenantId: string, documentId: string): Promise<core.IOrderer> {
        const tenant = await this.tenantManager.getTenant(tenantId);

        winston.info(tenant.orderer);
        winston.info(tenant.orderer.url);

        if (tenant.orderer.url !== this.ordererUrl) {
            return Promise.reject("Invalid ordering service endpoint");
        }

        return this.localOrderManager.get(tenantId, documentId);
    }
}
