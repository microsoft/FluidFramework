/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRuntimeStorageService } from "@fluidframework/container-definitions/internal";
import {
	type FetchSource,
	type ICreateBlobResponse,
	type IDocumentStorageServicePolicies,
	type ISnapshot,
	type ISnapshotFetchOptions,
	type ISnapshotTree,
	type ISummaryContext,
	type ISummaryHandle,
	type ISummaryTree,
	type IVersion,
} from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * IRuntimeStorageService proxy which intercepts requests if they can be satisfied by the blobs received in the
 * attach message. We use this to avoid an unnecessary request to the storage service.
 */
export class StorageServiceWithAttachBlobs implements IRuntimeStorageService {
	constructor(
		private readonly internalStorageService: IRuntimeStorageService,
		private readonly attachBlobs: Map<string, ArrayBufferLike>,
	) {}

	public get policies(): IDocumentStorageServicePolicies | undefined {
		return this.internalStorageService.policies;
	}

	public async readBlob(id: string): Promise<ArrayBufferLike> {
		const blob = this.attachBlobs.get(id);
		if (blob !== undefined) {
			return blob;
		}

		// Note that it is intentional not to cache the result of this readBlob - we'll trust the real
		// IRuntimeStorageService to cache appropriately, no need to double-cache.
		return this.internalStorageService.readBlob(id);
	}

	public async getSnapshotTree(
		version?: IVersion,
		scenarioName?: string,
		// eslint-disable-next-line @rushstack/no-new-null
	): Promise<ISnapshotTree | null> {
		return this.internalStorageService.getSnapshotTree(version, scenarioName);
	}

	public async getSnapshot(snapshotFetchOptions?: ISnapshotFetchOptions): Promise<ISnapshot> {
		if (this.internalStorageService.getSnapshot !== undefined) {
			return this.internalStorageService.getSnapshot(snapshotFetchOptions);
		}
		throw new UsageError(
			"getSnapshot api should exist on internal storage in documentStorageServiceProxy class",
		);
	}

	public async getVersions(
		// eslint-disable-next-line @rushstack/no-new-null
		versionId: string | null,
		count: number,
		scenarioName?: string,
		fetchSource?: FetchSource,
	): Promise<IVersion[]> {
		return this.internalStorageService.getVersions(
			versionId,
			count,
			scenarioName,
			fetchSource,
		);
	}

	public async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		return this.internalStorageService.uploadSummaryWithContext(summary, context);
	}

	public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		return this.internalStorageService.createBlob(file);
	}

	public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
		return this.internalStorageService.downloadSummary(handle);
	}
}
