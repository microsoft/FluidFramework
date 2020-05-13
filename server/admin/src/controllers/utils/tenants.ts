/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import request from "request-promise-native";
import { ITenantInput } from "../../definitions";

export async function addTenant(url: string, tenant: ITenantInput): Promise<any> {
    const newTenant = await request.post(
        `${url}/api/tenants`,
        {
            body: tenant,
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json: true,
        });
    return newTenant;
}

export async function deleteTenant(url: string, tenantId: string): Promise<string> {
    await request.delete(
        `${url}/api/tenants/${tenantId}`,
        {
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json: true,
        },
    );
    return tenantId;
}
