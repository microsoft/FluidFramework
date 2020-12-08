/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITenantConfig } from "@fluidframework/server-services-core";
import * as request from "request-promise-native";
import * as winston from "winston";
import { getTokenLifetimeInSec } from "../utils";
import { ITenantService } from "./definitions";
import { RedisTenantCache } from "./redisTenantCache";

export class RiddlerService implements ITenantService {
    constructor(private readonly endpoint: string, private readonly cache: RedisTenantCache) {
    }

    public async getTenant(tenantId: string, token: string): Promise<ITenantConfig> {
        const [tenant] = await Promise.all([this.getTenantDetails(tenantId), this.verifyToken(tenantId, token)]);
        return tenant;
    }

    private async getTenantDetails(tenantId: string): Promise<ITenantConfig> {
        const cachedDetail = await this.cache.get(tenantId).catch((error) => {
            winston.error(`Error fetching tenant details from cache`, error);
            return null;
        });
        if (cachedDetail) {
            winston.info(`Resolving tenant details from cache`);
            return JSON.parse(cachedDetail) as ITenantConfig;
        }
        const details = await request.get(
            `${this.endpoint}/api/tenants/${tenantId}`,
            {
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            }) as ITenantConfig;
        this.cache.set(tenantId, JSON.stringify(details)).catch((error) => {
            winston.error(`Error caching tenant details to redis`, error);
        });
        return details;
    }

    private async verifyToken(tenantId: string, token: string): Promise<void> {
        const cachedToken = await this.cache.exists(token).catch((error) => {
            winston.error(`Error fetching token from cache`, error);
            return false;
        });

        if (cachedToken) {
            winston.info(`Resolving token from cache`);
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

        let tokenLifetimeInSec = getTokenLifetimeInSec(token);
        // in case the service clock is behind, reducing the lifetime of token by 5%
        // to avoid using an expired token.
        if (tokenLifetimeInSec) {
            tokenLifetimeInSec = tokenLifetimeInSec - ((tokenLifetimeInSec * 5) / 100);
        }
        this.cache.set(token, "", tokenLifetimeInSec).catch((error) => {
            winston.error(`Error caching token to redis`, error);
        });
    }
}
