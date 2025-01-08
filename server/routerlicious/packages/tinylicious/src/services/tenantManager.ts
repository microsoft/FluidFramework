/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { default as Axios } from "axios";
import {
	ITenant,
	ITenantConfig,
	ITenantConfigManager,
	ITenantManager,
	ITenantOrderer,
	ITenantStorage,
} from "@fluidframework/server-services-core";
import {
	BasicRestWrapper,
	GitManager,
	Historian,
	IGitManager,
} from "@fluidframework/server-services-client";
import type { ScopeType, IUser } from "@fluidframework/protocol-definitions";

export class TinyliciousTenant implements ITenant {
	private readonly owner = "tinylicious";
	private readonly repository = "tinylicious";
	private readonly manager: GitManager;

	constructor(
		private readonly url: string,
		private readonly historianUrl: string,
	) {
		// Using an explicitly constructed rest wrapper so we can pass the Axios instance whose static defaults
		// were modified by Tinylicious, and avoid issues if the module that contains BasicRestWrapper depends on a different
		// version of Axios.
		const restWrapper = new BasicRestWrapper(
			historianUrl,
			undefined /* defaultQueryString */,
			undefined /* maxBodyLength */,
			undefined /* maxContentLength */,
			undefined /* defaultHeaders */,
			Axios,
		);
		const historian = new Historian(historianUrl, false, false, restWrapper);

		this.manager = new GitManager(historian);
	}

	public get gitManager(): GitManager {
		return this.manager;
	}

	public get storage(): ITenantStorage {
		return {
			historianUrl: this.historianUrl,
			internalHistorianUrl: this.historianUrl,
			credentials: {
				user: "tinylicious",
				password: "",
			},
			owner: this.owner,
			repository: this.repository,
			url: this.url,
		};
	}

	public get orderer(): ITenantOrderer {
		return {
			type: "kafka",
			url: this.url,
		};
	}
}

export class TenantManager implements ITenantManager, ITenantConfigManager {
	constructor(private readonly url: string) {}

	public async getTenantGitManager(tenantId: string, _documentId: string): Promise<IGitManager> {
		const tenant = await this.getTenant(tenantId);
		return tenant.gitManager;
	}

	public async createTenant(tenantId?: string): Promise<ITenantConfig & { key: string }> {
		throw new Error("Method not implemented.");
	}

	public async getTenantfromRiddler(tenantId?: string): Promise<ITenantConfig> {
		throw new Error("Method not implemented.");
	}

	public getTenant(tenantId: string): Promise<ITenant> {
		return Promise.resolve(
			new TinyliciousTenant(this.url, `${this.url}/repos/${encodeURIComponent(tenantId)}`),
		);
	}

	public async verifyToken(tenantId: string, token: string): Promise<void> {
		return;
	}

	public getKey(tenantId: string): Promise<string> {
		throw new Error("Method not implemented.");
	}

	public async getTenantStorageName(tenantId: string): Promise<string> {
		return tenantId;
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
		throw new Error("Method not implemented.");
	}
}
