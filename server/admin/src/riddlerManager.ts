/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as request from "request-promise-native";
import { IOrderer, ITenantStorage } from "./definitions";

export interface ITenantConfig {
    id: string;

    storage: ITenantStorage;

    orderer: IOrderer;
}

/**
 * Manages api calls to riddler
 */
export class RiddlerManager {
    constructor(private readonly endpoint: string) {
    }

    public async getTenant(tenantId: string): Promise<ITenantConfig> {
        const tenantConfig = await request.get(
            `${this.endpoint}/api/tenants/${tenantId}`,
            {
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            }) as ITenantConfig;

        return tenantConfig;
    }

    public async addTenant(): Promise<ITenantConfig & { key: string; }> {
        const tenant = await request.post(
            `${this.endpoint}/api/tenants`,
            {
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            }) as ITenantConfig & { key: string; };
        return tenant;
    }

    public async updateTenantStorage(tenantId: string, storage: ITenantStorage): Promise<void> {
        await request.put(
            `${this.endpoint}/api/tenants/${tenantId}/storage`,
            {
                body: storage,
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            },
        );
    }

    public async updateTenantOrderer(tenantId: string, orderer: IOrderer): Promise<void> {
        await request.put(
            `${this.endpoint}/api/tenants/${tenantId}/orderer`,
            {
                body: orderer,
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            },
        );
    }

    public async getKey(tenantId: string): Promise<string> {
        const key = await request.get(
            `${this.endpoint}/api/tenants/${tenantId}/key`,
            {
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            }) as string;
        return key;
    }
}
