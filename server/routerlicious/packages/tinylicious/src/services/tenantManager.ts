/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ScopeType, IUser } from "@fluidframework/protocol-definitions";
import type { ICreateBlobResponse } from "@fluidframework/gitresources";
import {
	BasicRestWrapper,
	GitManager,
	Historian,
	type IGitManager,
} from "@fluidframework/server-services-client";
import type {
	ITenant,
	ITenantConfig,
	ITenantConfigManager,
	ITenantManager,
	ITenantOrderer,
	ITenantStorage,
} from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { queue } from "async";
import { default as Axios } from "axios";

/**
 * Tinylicious hosts Alfred and Historian in one process but communicates between them over
 * localhost HTTP. Concurrent summaries can otherwise create thousands of blob requests and
 * sockets at once, delaying all requests handled by the process.
 *
 * This limit is shared across Tinylicious tenants so concurrent documents use one request budget.
 */
const maxConcurrentBlobUploads = 50;
const blobUploadQueueLengthTelemetryThresholds = [100, 200] as const;

type BlobUpload = () => Promise<ICreateBlobResponse>;

// Invoke each deferred upload when queue capacity is available.
const blobUploadQueue = queue<BlobUpload>(async (upload) => upload(), maxConcurrentBlobUploads);

const reachedBlobUploadQueueLengthThresholds = new Set<number>();
let maxObservedBlobUploadQueueLength = 0;

function recordBlobUploadQueueLength(): void {
	const availableWorkers = maxConcurrentBlobUploads - blobUploadQueue.running();
	const queueLength = Math.max(0, blobUploadQueue.length() - availableWorkers);
	maxObservedBlobUploadQueueLength = Math.max(maxObservedBlobUploadQueueLength, queueLength);

	for (const threshold of blobUploadQueueLengthTelemetryThresholds) {
		if (queueLength >= threshold && !reachedBlobUploadQueueLengthThresholds.has(threshold)) {
			reachedBlobUploadQueueLengthThresholds.add(threshold);
			Lumberjack.warning("Tinylicious blob upload queue length threshold reached", {
				queueLength,
				queueLengthThreshold: threshold,
				maxConcurrentBlobUploads,
			});
		}
	}
}

blobUploadQueue.unsaturated(() => {
	if (reachedBlobUploadQueueLengthThresholds.size === 0) {
		return;
	}

	Lumberjack.info("Tinylicious blob upload queue is unsaturated", {
		queueLength: blobUploadQueue.length(),
		runningBlobUploads: blobUploadQueue.running(),
		maxObservedQueueLength: maxObservedBlobUploadQueueLength,
		queueLengthThresholdsReached: [...reachedBlobUploadQueueLengthThresholds].join(","),
		maxConcurrentBlobUploads,
	});

	reachedBlobUploadQueueLengthThresholds.clear();
	maxObservedBlobUploadQueueLength = 0;
});

/**
 * Tinylicious Git manager that bounds blob uploads before their Historian requests are created.
 */
export class TinyliciousGitManager extends GitManager {
	public override async createBlob(
		content: string,
		encoding: "utf-8" | "base64",
	): Promise<ICreateBlobResponse> {
		const upload = blobUploadQueue.pushAsync<ICreateBlobResponse>(async () =>
			super.createBlob(content, encoding),
		);
		recordBlobUploadQueueLength();
		return upload;
	}
}

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

		this.manager = new TinyliciousGitManager(historian);
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
