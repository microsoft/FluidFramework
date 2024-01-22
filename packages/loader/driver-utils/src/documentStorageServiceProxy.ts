/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	FetchSource,
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
	ISnapshot,
	ISnapshotFetchOptions,
	ISummaryContext,
} from "@fluidframework/driver-definitions";
import {
	ICreateBlobResponse,
	ISnapshotTree,
	ISummaryHandle,
	ISummaryTree,
	IVersion,
} from "@fluidframework/protocol-definitions";

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

	public get repositoryUrl(): string {
		return this.internalStorageService.repositoryUrl;
	}

	constructor(protected readonly internalStorageService: IDocumentStorageService) {}

	public async getSnapshotTree(
		version?: IVersion,
		scenarioName?: string,
	): Promise<ISnapshotTree | null> {
		return this.internalStorageService.getSnapshotTree(version, scenarioName);
	}

	public async getSnapshot(
		version?: IVersion,
		snapshotFetchOptions?: ISnapshotFetchOptions,
	): Promise<ISnapshot | undefined> {
		assert(
			this.internalStorageService.getSnapshot !== undefined,
			"getSnapshot api should exist on documentStorageServiceProxy class",
		);
		return this.internalStorageService.getSnapshot(version, snapshotFetchOptions);
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
