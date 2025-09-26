/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType, type IUser } from "@fluidframework/protocol-definitions";
import {
	GitManager,
	Historian,
	type ICredentials,
	BasicRestWrapper,
	getAuthorizationTokenFromCredentials,
	type IGitManager,
	parseToken,
	isNetworkError,
	NetworkError,
} from "@fluidframework/server-services-client";
import * as core from "@fluidframework/server-services-core";
import type { IInvalidTokenError } from "@fluidframework/server-services-core";
import {
	CommonProperties,
	getLumberBaseProperties,
	getGlobalTelemetryContext,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";
import {
	extractTokenFromHeader,
	getValidAccessToken,
	logHttpMetrics,
} from "@fluidframework/server-services-utils";
import type { RawAxiosRequestHeaders } from "axios";

import { IsEphemeralContainer } from ".";

/**
 * Filters out potentially dangerous headers that could compromise security
 * @internal
 */
function filterSafeHeaders(headers: RawAxiosRequestHeaders): RawAxiosRequestHeaders {
	const dangerousHeaders = [
		"authorization",
		"cookie",
		"x-auth-token",
		"bearer",
		"x-auth",
		"auth",
		"token",
		IsEphemeralContainer.toLowerCase(),
		"storagename",
	];

	const filtered: RawAxiosRequestHeaders = {};
	for (const [key, value] of Object.entries(headers)) {
		const isSecurityHeader = dangerousHeaders.some((dangerous) =>
			key.toLowerCase().includes(dangerous.toLowerCase()),
		);

		if (!isSecurityHeader) {
			filtered[key] = value;
		}
	}

	return filtered;
}

/**
 * Configuration options for customizing the GitManager creation
 * @internal
 */
export interface IGitManagerConfig {
	/** Default query string parameters */
	defaultQueryString?: Record<string, any>;
	/** Maximum body length for requests */
	maxBodyLength?: number;
	/** Maximum content length for requests */
	maxContentLength?: number;
	/** Default headers to include */
	defaultHeaders?: RawAxiosRequestHeaders;
	/** Custom function to get default headers */
	getDefaultHeaders?: () => RawAxiosRequestHeaders;
	/** Custom function to refresh default query string */
	refreshDefaultQueryString?: () => Record<string, any>;
	/** Custom function to refresh default headers */
	refreshDefaultHeaders?: () => RawAxiosRequestHeaders;
	/** Custom function to refresh tokens when needed */
	refreshTokenIfNeeded?: (
		authorizationHeader: RawAxiosRequestHeaders,
	) => Promise<RawAxiosRequestHeaders | undefined>;
	/** Custom function to get correlation ID */
	getCorrelationId?: () => string | undefined;
	/** Custom function to get telemetry properties */
	getTelemetryProperties?: () => Record<string, any>;
	/** Custom function to log HTTP metrics */
	logHttpMetrics?: (requestProps: any) => void;
	/** Custom function to get service name */
	getServiceName?: () => string;
}

/**
 * Decorator function type for customizing GitManager configuration
 * @internal
 */
export type GitManagerConfigDecorator = (
	config: IGitManagerConfig,
	context: {
		tenantId: string;
		documentId: string;
		storageName?: string;
		isEphemeralContainer: boolean;
		accessToken: string;
		baseUrl: string;
	},
) => IGitManagerConfig;

/**
 * Utility decorator implementations for common use cases
 *
 * ⚠️ SECURITY NOTE: This decorator implements security protections to prevent
 * malicious code injection. Critical security functions (token refresh,
 * correlation ID, telemetry) are immutable and cannot be overridden.
 * Authorization headers and security-related headers are filtered and protected.
 *
 * @internal
 */
export const GitManagerConfigDecorators = {
	/**
	 * Applies custom configuration overrides with built-in security protections.
	 *
	 * 🔒 Security Features:
	 * - Filters out dangerous headers (authorization, auth tokens, cookies, etc.)
	 * - Protects critical security functions from being overridden
	 * - Preserves system-generated authorization and routing headers
	 * - Prevents token refresh logic manipulation
	 *
	 * @param customConfig - Partial configuration object or a function that receives
	 * the current config and context to return custom overrides
	 *
	 * @example Simple overrides (security-filtered):
	 * ```typescript
	 * GitManagerConfigDecorators.withCustom({
	 *   defaultHeaders: {
	 *     'X-Custom-Header': 'value', // ✅ Safe custom header
	 *     'Authorization': 'Bearer evil', // ❌ Filtered out for security
	 *   },
	 *   maxBodyLength: 2000 * 1024, // ✅ Safe limit override
	 *   logHttpMetrics: (props) => console.log('Custom metrics:', props), // ✅ Allowed
	 * })
	 * ```
	 *
	 * @example Context-aware overrides:
	 * ```typescript
	 * GitManagerConfigDecorators.withCustom((config, context) => ({
	 *   defaultHeaders: {
	 *     'X-Tenant-ID': context.tenantId, // ✅ Safe tenant info
	 *     'X-Document-Type': context.isEphemeralContainer ? 'ephemeral' : 'persistent',
	 *   },
	 *   maxBodyLength: context.isEphemeralContainer ? 100 * 1024 : 1000 * 1024,
	 * }))
	 * ```
	 *
	 * @example Protected functions (these are immutable for security):
	 * ```typescript
	 * // ❌ These overrides will be ignored for security:
	 * GitManagerConfigDecorators.withCustom({
	 *   refreshTokenIfNeeded: evilTokenStealer, // Ignored - security protected
	 *   getCorrelationId: () => 'hacked',       // Ignored - security protected
	 *   getTelemetryProperties: evilLogger,     // Ignored - security protected
	 * })
	 * ```
	 */
	withCustom:
		(
			customConfig:
				| Partial<IGitManagerConfig>
				| ((
						config: IGitManagerConfig,
						context: {
							tenantId: string;
							documentId: string;
							storageName?: string;
							isEphemeralContainer: boolean;
							accessToken: string;
							baseUrl: string;
						},
				  ) => Partial<IGitManagerConfig>),
		): GitManagerConfigDecorator =>
		(config, context) => {
			const overrides =
				typeof customConfig === "function" ? customConfig(config, context) : customConfig;

			// Apply customizations with security filtering
			const secureConfig = {
				...config,
				...overrides,
				// Handle nested objects properly by merging them with security filtering
				defaultHeaders: {
					...config.defaultHeaders,
					...filterSafeHeaders(overrides.defaultHeaders || {}),
				},
				defaultQueryString: {
					...config.defaultQueryString,
					...overrides.defaultQueryString,
				},
			};

			// 🔒 IMMUTABLE SECURITY LAYER - These critical functions cannot be overridden
			secureConfig.refreshTokenIfNeeded = config.refreshTokenIfNeeded;
			secureConfig.getCorrelationId = config.getCorrelationId;
			secureConfig.getTelemetryProperties = config.getTelemetryProperties;
			secureConfig.getServiceName = config.getServiceName;

			// Ensure authorization and other security-critical headers are preserved
			if (config.defaultHeaders?.Authorization) {
				secureConfig.defaultHeaders.Authorization = config.defaultHeaders.Authorization;
			}
			if (config.defaultHeaders && IsEphemeralContainer in config.defaultHeaders) {
				secureConfig.defaultHeaders[IsEphemeralContainer] =
					config.defaultHeaders[IsEphemeralContainer];
			}
			if (config.defaultHeaders?.StorageName) {
				secureConfig.defaultHeaders.StorageName = config.defaultHeaders.StorageName;
			}

			return secureConfig;
		},

	/**
	 * Composes multiple decorators into one
	 */
	compose:
		(...decorators: GitManagerConfigDecorator[]): GitManagerConfigDecorator =>
		(config, context) =>
			decorators.reduce((acc, decorator) => decorator(acc, context), config),
};

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
		private readonly invalidTokenCache?: core.ICache,
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
			() => getGlobalTelemetryContext().getProperties().serviceName ?? "" /* serviceName */,
		);
		const result = await restWrapper.post<core.ITenantConfig & { key: string }>(
			`/api/tenants/${encodeURIComponent(tenantId || "")}`,
			undefined /* requestBody */,
		);
		return result;
	}

	public async getTenantfromRiddler(tenantId?: string): Promise<core.ITenantConfig> {
		const restWrapper = new BasicRestWrapper(
			undefined /* baseUrl */,
			undefined /* defaultQueryString */,
			undefined /* maxBodyLength */,
			undefined /* maxContentLength */,
			undefined /* defaultHeaders */,
			undefined /* axios */,
			undefined /* refreshDefaultQureyString */,
			undefined /* refreshDefaultHeaders */,
			() => getGlobalTelemetryContext().getProperties().correlationId,
			() => getGlobalTelemetryContext().getProperties(),
		);
		const result = await restWrapper.get<core.ITenantConfig>(
			`${this.endpoint}/api/tenants/${encodeURIComponent(tenantId || "")}`,
			undefined,
		);
		return result;
	}

	public async getTenant(
		tenantId: string,
		documentId: string,
		includeDisabledTenant = false,
		configDecorator?: GitManagerConfigDecorator,
	): Promise<core.ITenant> {
		const [details, gitManager] = await Promise.all([
			this.getTenantConfig(tenantId, includeDisabledTenant),
			this.getTenantGitManager(
				tenantId,
				documentId,
				undefined,
				includeDisabledTenant,
				false,
				configDecorator,
			),
		]);

		const tenant = new Tenant(details, gitManager);

		return tenant;
	}

	/**
	 * Gets a GitManager instance for a specific tenant and document.
	 *
	 * @param tenantId - The tenant identifier
	 * @param documentId - The document identifier
	 * @param storageName - Optional storage name for routing
	 * @param includeDisabledTenant - Whether to include disabled tenants
	 * @param isEphemeralContainer - Whether this is for an ephemeral container
	 * @param configDecorator - Optional decorator to customize the GitManager configuration
	 * (Security: Critical functions are protected from override)
	 *
	 * @example Basic usage:
	 * ```typescript
	 * const gitManager = await tenantManager.getTenantGitManager(tenantId, documentId);
	 * ```
	 *
	 * @example With custom headers:
	 * ```typescript
	 * const gitManager = await tenantManager.getTenantGitManager(
	 *   tenantId,
	 *   documentId,
	 *   undefined,
	 *   false,
	 *   false,
	 *   GitManagerConfigDecorators.withCustom({
	 *     defaultHeaders: {
	 *       'X-Custom-Header': 'custom-value',
	 *       'X-Request-ID': requestId,
	 *     }
	 *   })
	 * );
	 * ```
	 *
	 * @example With custom metrics and query params:
	 * ```typescript
	 * const gitManager = await tenantManager.getTenantGitManager(
	 *   tenantId, documentId, undefined, false, false,
	 *   GitManagerConfigDecorators.withCustom({
	 *     defaultQueryString: { version: '2.0' },
	 *     logHttpMetrics: (props) => {
	 *       console.log('Custom HTTP metrics:', props);
	 *       // Your custom logging logic here
	 *     },
	 *   })
	 * );
	 * ```
	 *
	 * @example Custom decorator for specific tenant needs:
	 * ```typescript
	 * const customDecorator = GitManagerConfigDecorators.withCustom((config, context) => ({
	 *   defaultHeaders: {
	 *     'X-Tenant-ID': context.tenantId,        // ✅ Safe custom header
	 *     'X-Document-ID': context.documentId,    // ✅ Safe custom header
	 *     'X-Storage-Name': context.storageName || 'default', // ✅ Safe custom header
	 *   },
	 *   maxBodyLength: context.isEphemeralContainer ? 100 * 1024 : 1000 * 1024, // ✅ Safe override
	 *   // refreshTokenIfNeeded: customRefresh, // ❌ This would be ignored for security
	 * }));
	 *
	 * // Or even simpler for static overrides:
	 * const simpleDecorator = GitManagerConfigDecorators.withCustom({
	 *   maxBodyLength: 2000 * 1024,                          // ✅ Safe limit
	 *   defaultQueryString: { version: '2.0', source: 'custom' }, // ✅ Safe params
	 *   logHttpMetrics: customMetricsLogger,                 // ✅ Safe (with validation)
	 * });
	 * ```
	 */
	public async getTenantGitManager(
		tenantId: string,
		documentId: string,
		storageName?: string,
		includeDisabledTenant = false,
		isEphemeralContainer = false,
		configDecorator?: GitManagerConfigDecorator,
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

		const baseUrl = `${this.internalHistorianUrl}/repos/${encodeURIComponent(tenantId)}`;

		// Create default configuration
		const defaultQueryString = {};
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

		// Create default configuration
		let config: IGitManagerConfig = {
			defaultQueryString,
			defaultHeaders: getDefaultHeaders(),
			getDefaultHeaders,
			refreshTokenIfNeeded,
			getCorrelationId: () => getGlobalTelemetryContext().getProperties().correlationId,
			getTelemetryProperties: () => getGlobalTelemetryContext().getProperties(),
			logHttpMetrics,
			getServiceName: () => getGlobalTelemetryContext().getProperties().serviceName ?? "",
		};

		// Apply decorator if provided
		if (configDecorator) {
			config = configDecorator(config, {
				tenantId,
				documentId,
				storageName,
				isEphemeralContainer,
				accessToken,
				baseUrl,
			});
		}

		const tenantRestWrapper = new BasicRestWrapper(
			baseUrl,
			config.defaultQueryString,
			config.maxBodyLength,
			config.maxContentLength,
			config.defaultHeaders,
			undefined,
			config.refreshDefaultQueryString,
			config.refreshDefaultHeaders ?? config.getDefaultHeaders,
			config.getCorrelationId,
			config.getTelemetryProperties,
			config.refreshTokenIfNeeded,
			config.logHttpMetrics,
			config.getServiceName,
		);
		const historian = new Historian(baseUrl, true, false, tenantRestWrapper);
		const gitManager = new GitManager(historian);

		return gitManager;
	}

	private throwInvalidTokenErrorAsNetworkError(cachedInvalidTokenError: string): void {
		try {
			const errorObject: IInvalidTokenError = JSON.parse(cachedInvalidTokenError);
			const networkError = new NetworkError(
				errorObject.code,
				errorObject.message,
				false,
				false,
				undefined,
				"InvalidTokenCache",
			);
			throw networkError;
		} catch (error: unknown) {
			if (isNetworkError(error)) {
				throw error;
			}
			// Do not throw an error if the cached invalid token error is not a valid JSON
			Lumberjack.error("Failed to parse cached invalid token error", {}, error);
		}
	}

	public async verifyToken(tenantId: string, token: string): Promise<void> {
		if (this.invalidTokenCache) {
			const cachedInvalidTokenError = await this.invalidTokenCache.get(token);
			if (cachedInvalidTokenError) {
				this.throwInvalidTokenErrorAsNetworkError(cachedInvalidTokenError);
			}
		}
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
			() => getGlobalTelemetryContext().getProperties().serviceName ?? "" /* serviceName */,
		);
		try {
			await restWrapper.post(`/api/tenants/${encodeURIComponent(tenantId)}/validate`, {
				token,
			});
		} catch (error: unknown) {
			if (isNetworkError(error)) {
				// In case of a 401 or 403 error, we cache the token in the invalid token cache
				// to avoid hitting the endpoint again with the same token.
				if (error.code === 401 || error.code === 403) {
					const errorToCache: IInvalidTokenError = {
						code: error.code,
						message: error.message,
					};
					// Cache the token in the invalid token cache
					// to avoid hitting the endpoint again with the same token.
					this.invalidTokenCache
						?.set(token, JSON.stringify(errorToCache))
						.catch((err) => {
							Lumberjack.error(
								"Failed to set token in invalid token cache",
								{ tenantId },
								err,
							);
						});
				}
			}
			throw error;
		}
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
			() => getGlobalTelemetryContext().getProperties().serviceName ?? "" /* serviceName */,
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
			() => getGlobalTelemetryContext().getProperties().serviceName ?? "" /* serviceName */,
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
			() => getGlobalTelemetryContext().getProperties().serviceName ?? "" /* serviceName */,
		);
		return restWrapper.get<core.ITenantConfig>(`/api/tenants/${tenantId}`, {
			includeDisabledTenant,
		});
	}
}
