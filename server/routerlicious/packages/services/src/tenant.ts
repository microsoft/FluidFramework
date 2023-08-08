/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	GitManager,
	Historian,
	ICredentials,
	BasicRestWrapper,
	getAuthorizationTokenFromCredentials,
	IGitManager,
} from "@fluidframework/server-services-client";
import { generateToken, getCorrelationId } from "@fluidframework/server-services-utils";
import * as core from "@fluidframework/server-services-core";
import { fromUtf8ToBase64 } from "@fluidframework/common-utils";
import {
	CommonProperties,
	getLumberBaseProperties,
} from "@fluidframework/server-services-telemetry";
import { AxiosRequestHeaders } from "axios";
import { IsEphemeralContainer } from ".";

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
 */
export class TenantManager implements core.ITenantManager, core.ITenantConfigManager {
	constructor(private readonly endpoint: string, private readonly internalHistorianUrl: string) {}

	public async createTenant(tenantId?: string): Promise<core.ITenantConfig & { key: string }> {
		const restWrapper = new BasicRestWrapper();
		const result = await restWrapper.post<core.ITenantConfig & { key: string }>(
			`${this.endpoint}/api/tenants/${encodeURIComponent(tenantId || "")}`,
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
		const key = await core.requestWithRetry(
			async () => this.getKey(tenantId, includeDisabledTenant),
			"getTenantGitManager_getKey" /* callName */,
			lumberProperties /* telemetryProperties */,
		);

		const defaultQueryString = {
			token: fromUtf8ToBase64(`${tenantId}`),
		};
		const getDefaultHeaders = () => {
			const credentials: ICredentials = {
				password: generateToken(tenantId, documentId, key, null),
				user: tenantId,
			};
			const headers: AxiosRequestHeaders = {
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
			getCorrelationId,
		);
		const historian = new Historian(
			`${this.internalHistorianUrl}/repos/${encodeURIComponent(tenantId)}`,
			true,
			false,
			tenantRestWrapper,
		);
		const gitManager = new GitManager(historian);

		return gitManager;
	}

	public async verifyToken(tenantId: string, token: string): Promise<void> {
		const restWrapper = new BasicRestWrapper();
		await restWrapper.post(
			`${this.endpoint}/api/tenants/${encodeURIComponent(tenantId)}/validate`,
			{ token },
		);
	}

	public async getKey(tenantId: string, includeDisabledTenant = false): Promise<string> {
		const restWrapper = new BasicRestWrapper();
		const result = await restWrapper.get<core.ITenantKeys>(
			`${this.endpoint}/api/tenants/${encodeURIComponent(tenantId)}/keys`,
			{ includeDisabledTenant },
		);
		return result.key1;
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
		const restWrapper = new BasicRestWrapper();
		return restWrapper.get<core.ITenantConfig>(`${this.endpoint}/api/tenants/${tenantId}`, {
			includeDisabledTenant,
		});
	}
}
