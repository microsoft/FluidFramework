/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import { ITenantConfig } from "@fluidframework/server-services-core";
import { getCorrelationId } from "@fluidframework/server-services-utils";
import { BasicRestWrapper, RestWrapper } from "@fluidframework/server-services-client";
import * as uuid from "uuid";
import * as winston from "winston";
import { getRequestErrorTranslator, getTokenLifetimeInSec } from "../utils";
import { ITenantService } from "./definitions";
import { RedisTenantCache } from "./redisTenantCache";

export class RiddlerService implements ITenantService {
    private readonly restWrapper: RestWrapper;
    constructor(
        endpoint: string,
        private readonly cache: RedisTenantCache,
        private readonly asyncLocalStorage?: AsyncLocalStorage<string>) {
        this.restWrapper = new BasicRestWrapper(
            endpoint,
            undefined,
            undefined,
            undefined,
            {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            undefined,
            undefined,
            undefined,
            () => getCorrelationId(this.asyncLocalStorage) || uuid.v4(),
        );
    }

    public async getTenant(tenantId: string, token: string): Promise<ITenantConfig> {
        const [tenant] = await Promise.all([this.getTenantDetails(tenantId), this.verifyToken(tenantId, token)]);
        return tenant;
    }

    private async getTenantDetails(tenantId: string): Promise<ITenantConfig> {
        const cachedDetail = await this.cache.get(tenantId).catch((error) => {
            winston.error(`Error fetching tenant details from cache`, error);
            return undefined;
        });
        if (cachedDetail) {
            winston.info(`Resolving tenant details from cache`);
            return JSON.parse(cachedDetail) as ITenantConfig;
        }
        const tenantUrl = `/api/tenants/${tenantId}`;
        const details = await this.restWrapper.get<ITenantConfig>(tenantUrl)
            .catch(getRequestErrorTranslator(tenantUrl, "GET"));
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

        const tokenValidationUrl = `/api/tenants/${tenantId}/validate`;
        await this.restWrapper.post(tokenValidationUrl, { token })
            .catch(getRequestErrorTranslator(tokenValidationUrl, "POST"));

        // TODO: ensure token expiration validity as well using `validateTokenClaimsExpiration` from `services-client`
        let tokenLifetimeInSec = getTokenLifetimeInSec(token);
        // in case the service clock is behind, reducing the lifetime of token by 5%
        // to avoid using an expired token.
        if (tokenLifetimeInSec) {
            tokenLifetimeInSec = Math.round(tokenLifetimeInSec - ((tokenLifetimeInSec * 5) / 100));
        }
        this.cache.set(token, "", tokenLifetimeInSec).catch((error) => {
            winston.error(`Error caching token to redis`, error);
        });
    }
}
