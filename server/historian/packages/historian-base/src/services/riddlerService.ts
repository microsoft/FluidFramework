/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITenantConfig, ITenantConfigManager } from "@fluidframework/server-services-core";
import { BasicRestWrapper, RestWrapper } from "@fluidframework/server-services-client";
import { v4 as uuid } from "uuid";
import {
	BaseTelemetryProperties,
	Lumberjack,
	getGlobalTelemetryContext,
} from "@fluidframework/server-services-telemetry";
import { getRequestErrorTranslator, getTokenLifetimeInSec } from "../utils";
import { ITenantService } from "./definitions";
import { RedisTenantCache } from "./redisTenantCache";

export class RiddlerService implements ITenantService, ITenantConfigManager {
	private readonly restWrapper: RestWrapper;
	constructor(
		endpoint: string,
		private readonly cache: RedisTenantCache,
	) {
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
			() =>
				getGlobalTelemetryContext().getProperties().correlationId ??
				uuid() /* getCorrelationId */,
			() => getGlobalTelemetryContext().getProperties() /* getTelemetryContextProperties */,
		);
	}

	public async getTenant(
		tenantId: string,
		token: string,
		includeDisabledTenant = false,
	): Promise<ITenantConfig> {
		const [tenant] = await Promise.all([
			this.getTenantDetails(tenantId, includeDisabledTenant),
			this.verifyToken(tenantId, token, includeDisabledTenant),
		]);
		return tenant;
	}

	public async deleteFromCache(tenantId: string, token: string): Promise<boolean> {
		const results = await Promise.all([this.cache.delete(tenantId), this.cache.delete(token)]);

		return results.every(Boolean);
	}

	private async getTenantDetails(
		tenantId: string,
		includeDisabledTenant = false,
	): Promise<ITenantConfig> {
		const lumberProperties = { [BaseTelemetryProperties.tenantId]: tenantId };
		const cachedDetail = await this.cache.get(tenantId).catch((error) => {
			Lumberjack.error(`Error fetching tenant details from cache`, lumberProperties, error);
			return undefined;
		});
		if (cachedDetail) {
			Lumberjack.verbose(`Resolving tenant details from cache`, lumberProperties);
			return JSON.parse(cachedDetail) as ITenantConfig;
		}
		const tenantUrl = `/api/tenants/${tenantId}`;
		const details = await this.restWrapper
			.get<ITenantConfig>(tenantUrl, { includeDisabledTenant })
			.catch(getRequestErrorTranslator(tenantUrl, "GET", lumberProperties));
		this.cache.set(tenantId, JSON.stringify(details)).catch((error) => {
			Lumberjack.error(`Error caching tenant details to redis`, lumberProperties, error);
		});
		return details;
	}

	public async getTenantStorageName(tenantId: string): Promise<string> {
		const tenantConfig = await this.getTenantDetails(tenantId);
		const result = tenantConfig?.customData?.storageName as string;
		if (!result) {
			Lumberjack.error(`Tenant storage name not found`, {
				[BaseTelemetryProperties.tenantId]: tenantId,
			});
		}
		return result;
	}

	private async verifyToken(
		tenantId: string,
		token: string,
		includeDisabledTenant = false,
	): Promise<void> {
		const lumberProperties = { [BaseTelemetryProperties.tenantId]: tenantId };
		const cachedToken = await this.cache.exists(token).catch((error) => {
			Lumberjack.error(`Error fetching token from cache`, lumberProperties, error);
			return false;
		});

		if (cachedToken) {
			Lumberjack.verbose(`Resolving token from cache`, lumberProperties);
			return;
		}

		const tokenValidationUrl = `/api/tenants/${tenantId}/validate`;
		await this.restWrapper
			.post(tokenValidationUrl, { token }, { includeDisabledTenant })
			.catch(getRequestErrorTranslator(tokenValidationUrl, "POST", lumberProperties));

		// TODO: ensure token expiration validity as well using `validateTokenClaimsExpiration` from `services-client`
		let tokenLifetimeInSec = getTokenLifetimeInSec(token);
		// in case the service clock is behind, reducing the lifetime of token by 5%
		// to avoid using an expired token.
		if (tokenLifetimeInSec) {
			tokenLifetimeInSec = Math.round(tokenLifetimeInSec - (tokenLifetimeInSec * 5) / 100);
		}
		this.cache.set(token, "", tokenLifetimeInSec).catch((error) => {
			Lumberjack.error(`Error caching token to redis`, lumberProperties, error);
		});
	}
}
