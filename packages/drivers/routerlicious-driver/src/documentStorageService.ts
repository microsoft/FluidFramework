/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";
import {
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
	LoaderCachingPolicy,
} from "@fluidframework/driver-definitions";
import { ISnapshotTree, IVersion } from "@fluidframework/protocol-definitions";
import {
	DocumentStorageServiceProxy,
	PrefetchDocumentStorageService,
} from "@fluidframework/driver-utils";
import { IRouterliciousDriverPolicies } from "./policies";
import { ICache } from "./cache";
import { WholeSummaryDocumentStorageService } from "./wholeSummaryDocumentStorageService";
import { GitManager } from "./gitManager";
import { INormalizedWholeSnapshot } from "./contracts";

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
		noCacheGitManager?: GitManager,
		getStorageManager?: (disableCache?: boolean) => Promise<GitManager>,
	): IDocumentStorageService {
		const storageService = new WholeSummaryDocumentStorageService(
			id,
			manager,
			logger,
			policies,
			driverPolicies,
			blobCache,
			snapshotTreeCache,
			noCacheGitManager,
			getStorageManager,
		);

		// TODO: worth prefetching latest summary making version + snapshot call with WholeSummary storage?
		if (policies.caching === LoaderCachingPolicy.Prefetch) {
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
