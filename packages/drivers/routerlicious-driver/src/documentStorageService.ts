/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
	LoaderCachingPolicy,
	ISnapshotTree,
	IVersion,
} from "@fluidframework/driver-definitions/internal";
import {
	DocumentStorageServiceProxy,
	PrefetchDocumentStorageService,
} from "@fluidframework/driver-utils/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { ICache } from "./cache.js";
import { INormalizedWholeSnapshot } from "./contracts.js";
import { ISnapshotTreeVersion } from "./definitions.js";
import { GitManager } from "./gitManager.js";
import { IRouterliciousDriverPolicies } from "./policies.js";
import { ShreddedSummaryDocumentStorageService } from "./shreddedSummaryDocumentStorageService.js";
import { WholeSummaryDocumentStorageService } from "./wholeSummaryDocumentStorageService.js";

export class DocumentStorageService extends DocumentStorageServiceProxy {
	private _logTailSha: string | undefined = undefined;

	public get logTailSha(): string | undefined {
		return this._logTailSha;
	}

	private static loadInternalDocumentStorageService(
		id: string,
		manager: GitManager,
		logger: ITelemetryLoggerExt,
		policies: IDocumentStorageServicePolicies,
		driverPolicies?: IRouterliciousDriverPolicies,
		blobCache?: ICache<ArrayBufferLike>,
		snapshotTreeCache?: ICache<INormalizedWholeSnapshot>,
		shreddedSummaryTreeCache?: ICache<ISnapshotTreeVersion>,
		noCacheGitManager?: GitManager,
		getStorageManager?: (disableCache?: boolean) => Promise<GitManager>,
	): IDocumentStorageService {
		const storageService = driverPolicies?.enableWholeSummaryUpload
			? new WholeSummaryDocumentStorageService(
					id,
					manager,
					logger,
					policies,
					driverPolicies,
					blobCache,
					snapshotTreeCache,
					noCacheGitManager,
					getStorageManager,
				)
			: new ShreddedSummaryDocumentStorageService(
					id,
					manager,
					logger,
					policies,
					driverPolicies,
					blobCache,
					shreddedSummaryTreeCache,
					getStorageManager,
				);
		// TODO: worth prefetching latest summary making version + snapshot call with WholeSummary storage?
		if (
			!driverPolicies?.enableWholeSummaryUpload &&
			policies.caching === LoaderCachingPolicy.Prefetch
		) {
			return new PrefetchDocumentStorageService(storageService);
		}
		return storageService;
	}

	constructor(
		public readonly id: string,
		public manager: GitManager,
		logger: ITelemetryLoggerExt,
		policies: IDocumentStorageServicePolicies,
		driverPolicies?: IRouterliciousDriverPolicies,
		blobCache?: ICache<ArrayBufferLike>,
		snapshotTreeCache?: ICache<INormalizedWholeSnapshot>,
		shreddedSummaryTreeCache?: ICache<ISnapshotTreeVersion>,
		public noCacheGitManager?: GitManager,
		getStorageManager?: (disableCache?: boolean) => Promise<GitManager>,
	) {
		super(
			DocumentStorageService.loadInternalDocumentStorageService(
				id,
				manager,
				logger,
				policies,
				driverPolicies,
				blobCache,
				snapshotTreeCache,
				shreddedSummaryTreeCache,
				noCacheGitManager,
				getStorageManager,
			),
		);
	}

	public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
		const tree = await this.internalStorageService.getSnapshotTree(version);
		if (tree !== null) {
			this._logTailSha =
				".logTail" in tree.trees ? tree.trees[".logTail"].blobs.logTail : undefined;
		}
		return tree;
	}
}
