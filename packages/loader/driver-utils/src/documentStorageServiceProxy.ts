/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISummaryHandle, ISummaryTree } from "@fluidframework/driver-definitions";
import {
	FetchSource,
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
	ISnapshot,
	ISnapshotFetchOptions,
	ISummaryContext,
	ICreateBlobResponse,
	ISnapshotTree,
	IVersion,
} from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * @internal
 */
export class DocumentStorageServiceProxy implements IDocumentStorageService {
	private _policies: IDocumentStorageServicePolicies | undefined;

	public set policies(policies: IDocumentStorageServicePolicies | undefined) {
		this._policies = policies;
	}

	public get policies() {
		return this._policies ?? this.internalStorageService.policies;
	}

	constructor(protected readonly internalStorageService: IDocumentStorageService) {}

	public async getSnapshotTree(
		version?: IVersion,
		scenarioName?: string,
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
		versionId: string | null,
		count: number,
		scenarioName?: string,
		fetchSource?: FetchSource,
	): Promise<IVersion[]> {
		return this.internalStorageService.getVersions(versionId, count, scenarioName, fetchSource);
	}

	public async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		return this.internalStorageService.uploadSummaryWithContext(summary, context);
	}

	public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
		return this.internalStorageService.downloadSummary(handle);
	}

	public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		return this.internalStorageService.createBlob(file);
	}

	public async readBlob(blobId: string): Promise<ArrayBufferLike> {
		return this.internalStorageService.readBlob(blobId);
	}
}
