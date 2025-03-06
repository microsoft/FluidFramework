/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType, type IUser } from "@fluidframework/protocol-definitions";
import { fromUtf8ToBase64 } from "@fluidframework/server-common-utils";
import {
	GitManager,
	Historian,
	ICredentials,
	BasicRestWrapper,
	getAuthorizationTokenFromCredentials,
	IGitManager,
	parseToken,
} from "@fluidframework/server-services-client";
import * as core from "@fluidframework/server-services-core";
import {
	extractTokenFromHeader,
	getValidAccessToken,
	logHttpMetrics,
} from "@fluidframework/server-services-utils";
import {
	CommonProperties,
	getLumberBaseProperties,
	getGlobalTelemetryContext,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";
import { RawAxiosRequestHeaders } from "axios";
import { IsEphemeralContainer } from ".";

export function getRefreshTokenIfNeededCallback(
	tenantManager: core.ITenantManager,
	documentId: string,
	tenantId: string,
	scopes: ScopeType[],
	serviceName: string,
): (authorizationHeader: RawAxiosRequestHeaders) => Promise<RawAxiosRequestHeaders | undefined> {
	const refreshTokenIfNeeded = async (authorizationHeader: RawAxiosRequestHeaders) => {
		if (
			authorizationHeader.Authorization &&
			typeof authorizationHeader.Authorization === "string"
		) {
			const currentAccessToken = extractTokenFromHeader(authorizationHeader.Authorization);
			const props = {
				...getLumberBaseProperties(documentId, tenantId),
				serviceName,
				scopes,
			};
			const newAccessToken = await getValidAccessToken(
				currentAccessToken,
				tenantManager,
				tenantId,
				documentId,
				scopes,
				props,
			).catch((error) => {
				Lumberjack.error("Failed to refresh access token", props, error);
				throw error;
			});
			if (newAccessToken) {
				return {
					Authorization: `Basic ${newAccessToken}`,
				};
			}
			return undefined;
		}
	};
	return refreshTokenIfNeeded;
}

/**
 * @internal
 */
export class Tenant implements core.ITenant {
	public get id(): string {
		return this.config.id;
	}

	public get gitManager(): IGitManager {
		return this.manager;
	}

	public get storage(): core.ITenantStorage {
		return this.config.storage;
	}

	public get orderer(): core.ITenantOrderer {
		return this.config.orderer;
	}

	constructor(
		private readonly config: core.ITenantConfig,
		private readonly manager: IGitManager,
	) {}
}

/**
 * Manages a collection of tenants
 * @internal
 */
export class TenantManager implements core.ITenantManager, core.ITenantConfigManager {
	constructor(
		private readonly endpoint: string,
		private readonly internalHistorianUrl: string,
	) {}

	public async createTenant(tenantId?: string): Promise<core.ITenantConfig & { key: string }> {
		const restWrapper = new BasicRestWrapper(
			this.endpoint /* baseUrl */,
			undefined /* defaultQueryString */,
			undefined /* maxBodyLength */,
			undefined /* maxContentLength */,
			undefined /* defaultHeaders */,
			undefined /* axios */,
			undefined /* refreshDefaultQureyString */,
			undefined /* refreshDefaultHeaders */,
			() => getGlobalTelemetryContext().getProperties().correlationId,
			() => getGlobalTelemetryContext().getProperties(),
			undefined /* refreshTokenIfNeeded */,
			logHttpMetrics,
		);
		const result = await restWrapper.post<core.ITenantConfig & { key: string }>(
			`/api/tenants/${encodeURIComponent(tenantId || "")}`,
			undefined,
		);
		return result;
	}

	public async getTenant(
		tenantId: string,
		documentId: string,
		includeDisabledTenant = false,
	): Promise<core.ITenant> {
		const [details, gitManager] = await Promise.all([
			this.getTenantConfig(tenantId, includeDisabledTenant),
			this.getTenantGitManager(tenantId, documentId, undefined, includeDisabledTenant),
		]);

		const tenant = new Tenant(details, gitManager);

		return tenant;
	}

	public async getTenantGitManager(
		tenantId: string,
		documentId: string,
		storageName?: string,
		includeDisabledTenant = false,
		isEphemeralContainer = false,
	): Promise<IGitManager> {
		const lumberProperties = {
			...getLumberBaseProperties(documentId, tenantId),
			[CommonProperties.isEphemeralContainer]: isEphemeralContainer,
		};
		const scopes = [ScopeType.DocWrite, ScopeType.DocRead, ScopeType.SummaryWrite];
		const accessToken = await core.requestWithRetry(
			async () => this.signToken(tenantId, documentId, scopes),
			"getTenantGitManager_signToken" /* callName */,
			lumberProperties /* telemetryProperties */,
		);

		const defaultQueryString = {
			token: fromUtf8ToBase64(`${tenantId}`),
		};
		const getDefaultHeaders = () => {
			const credentials: ICredentials = {
				password: accessToken,
				user: tenantId,
			};
			const headers: RawAxiosRequestHeaders = {
				Authorization: getAuthorizationTokenFromCredentials(credentials),
			};
			if (storageName) {
				headers.StorageName = storageName;
			}

			// IsEphemeralContainer header is set only for ephemeral containers
			// It is not set if it is not ephemeral and when the driver did not send any info
			if (isEphemeralContainer) {
				headers[IsEphemeralContainer] = isEphemeralContainer;
			}
			return headers;
		};

		const refreshTokenIfNeeded = async (authorizationHeader: RawAxiosRequestHeaders) => {
			if (
				authorizationHeader.Authorization &&
				typeof authorizationHeader.Authorization === "string"
			) {
				const currentAccessToken = parseToken(tenantId, authorizationHeader.Authorization);
				if (currentAccessToken) {
					const props = {
						...lumberProperties,
						serviceName: "historian",
						scopes,
					};
					const tenantManager = new TenantManager(
						this.endpoint,
						this.internalHistorianUrl,
					);
					const newAccessToken = await getValidAccessToken(
						currentAccessToken,
						tenantManager,
						tenantId,
						documentId,
						scopes,
						props,
					).catch((error) => {
						Lumberjack.error("Failed to refresh access token", props, error);
						throw error;
					});
					if (newAccessToken) {
						const newCredentials: ICredentials = {
							password: newAccessToken,
							user: tenantId,
						};
						return {
							Authorization: getAuthorizationTokenFromCredentials(newCredentials),
						};
					}
					return undefined;
				}
			}
		};
		const defaultHeaders = getDefaultHeaders();
		const baseUrl = `${this.internalHistorianUrl}/repos/${encodeURIComponent(tenantId)}`;
		const tenantRestWrapper = new BasicRestWrapper(
			baseUrl,
			defaultQueryString,
			undefined,
			undefined,
			defaultHeaders,
			undefined,
			undefined,
			getDefaultHeaders,
			() => getGlobalTelemetryContext().getProperties().correlationId,
			() => getGlobalTelemetryContext().getProperties(),
			refreshTokenIfNeeded,
			logHttpMetrics,
		);
		const historian = new Historian(baseUrl, true, false, tenantRestWrapper);
		const gitManager = new GitManager(historian);

		return gitManager;
	}

	public async verifyToken(tenantId: string, token: string): Promise<void> {
		const restWrapper = new BasicRestWrapper(
			this.endpoint /* baseUrl */,
			undefined /* defaultQueryString */,
			undefined /* maxBodyLength */,
			undefined /* maxContentLength */,
			undefined /* defaultHeaders */,
			undefined /* axios */,
			undefined /* refreshDefaultQureyString */,
			undefined /* refreshDefaultHeaders */,
			() => getGlobalTelemetryContext().getProperties().correlationId,
			() => getGlobalTelemetryContext().getProperties(),
			undefined /* refreshTokenIfNeeded */,
			logHttpMetrics,
		);
		await restWrapper.post(`/api/tenants/${encodeURIComponent(tenantId)}/validate`, { token });
	}

	public async getKey(tenantId: string, includeDisabledTenant = false): Promise<string> {
		const restWrapper = new BasicRestWrapper(
			this.endpoint /* baseUrl */,
			undefined /* defaultQueryString */,
			undefined /* maxBodyLength */,
			undefined /* maxContentLength */,
			undefined /* defaultHeaders */,
			undefined /* axios */,
			undefined /* refreshDefaultQureyString */,
			undefined /* refreshDefaultHeaders */,
			() => getGlobalTelemetryContext().getProperties().correlationId,
			() => getGlobalTelemetryContext().getProperties(),
			undefined /* refreshTokenIfNeeded */,
			logHttpMetrics,
		);
		const result = await restWrapper.get<core.ITenantKeys>(
			`/api/tenants/${encodeURIComponent(tenantId)}/keys`,
			{ includeDisabledTenant },
		);
		return result.key1;
	}

	public async signToken(
		tenantId: string,
		documentId: string,
		scopes: ScopeType[],
		user?: IUser,
		lifetime?: number,
		ver?: string,
		jti?: string,
		includeDisabledTenant?: boolean,
	): Promise<string> {
		const restWrapper = new BasicRestWrapper(
			this.endpoint /* baseUrl */,
			undefined /* defaultQueryString */,
			undefined /* maxBodyLength */,
			undefined /* maxContentLength */,
			undefined /* defaultHeaders */,
			undefined /* axios */,
			undefined /* refreshDefaultQueryString */,
			undefined /* refreshDefaultHeaders */,
			() => getGlobalTelemetryContext().getProperties().correlationId,
			() => getGlobalTelemetryContext().getProperties(),
			undefined /* refreshTokenIfNeeded */,
			logHttpMetrics,
		);
		const result = await restWrapper.post<core.IFluidAccessToken>(
			`/api/tenants/${encodeURIComponent(tenantId)}/accesstoken`,
			{
				documentId,
				scopes,
				user,
				lifetime,
				ver,
				jti,
			},
			{ includeDisabledTenant: includeDisabledTenant ?? false },
		);
		return result.fluidAccessToken;
	}

	public async getTenantStorageName(
		tenantId: string,
		includeDisabledTenant = false,
	): Promise<string> {
		const tenantConfig = await this.getTenantConfig(tenantId, includeDisabledTenant);
		return tenantConfig?.customData?.storageName as string;
	}

	private async getTenantConfig(
		tenantId: string,
		includeDisabledTenant = false,
	): Promise<core.ITenantConfig> {
		const restWrapper = new BasicRestWrapper(
			this.endpoint /* baseUrl */,
			undefined /* defaultQueryString */,
			undefined /* maxBodyLength */,
			undefined /* maxContentLength */,
			undefined /* defaultHeaders */,
			undefined /* axios */,
			undefined /* refreshDefaultQureyString */,
			undefined /* refreshDefaultHeaders */,
			() => getGlobalTelemetryContext().getProperties().correlationId,
			() => getGlobalTelemetryContext().getProperties(),
			undefined /* refreshTokenIfNeeded */,
			logHttpMetrics,
		);
		return restWrapper.get<core.ITenantConfig>(`/api/tenants/${tenantId}`, {
			includeDisabledTenant,
		});
	}
}
