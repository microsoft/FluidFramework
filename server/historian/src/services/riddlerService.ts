/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as request from "request-promise-native";
import { ITenant, ITenantService } from "./definitions";

export class RiddlerService implements ITenantService {
    constructor(private endpoint: string) {
    }

    public async getTenant(tenantId: string, token: string): Promise<ITenant> {
        const [tenant] = await Promise.all([this.getTenantDetails(tenantId), this.verifyToken(tenantId, token)]);
        return tenant;
    }

    private async getTenantDetails(tenantId: string): Promise<ITenant> {
        const details = await request.get(
            `${this.endpoint}/api/tenants/${tenantId}`,
            {
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            }) as ITenant;

        return details;
    }

    private async verifyToken(tenantId: string, token: string): Promise<void> {
        if (!token) {
            return;
        }

        await request.post(
            `${this.endpoint}/api/tenants/${tenantId}/validate`,
            {
                body: {
                    token,
                },
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            });
    }
}
