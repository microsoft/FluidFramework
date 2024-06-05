/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@fluidframework/core-interfaces";
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
import {
	ITelemetryLoggerExt,
	LoggingError,
	UsageError,
} from "@fluidframework/telemetry-utils/internal";

import { runWithRetry } from "./retryUtils.js";

export class RetryErrorsStorageAdapter implements IDocumentStorageService, IDisposable {
	private _disposed = false;
	constructor(
		private readonly internalStorageService: IDocumentStorageService,
		private readonly logger: ITelemetryLoggerExt,
	) {}

	public get policies(): IDocumentStorageServicePolicies | undefined {
		return this.internalStorageService.policies;
	}
	public get disposed(): boolean {
		return this._disposed;
	}
	public dispose(): void {
		this._disposed = true;
	}

	// eslint-disable-next-line @rushstack/no-new-null
	public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
		return this.runWithRetry(
			async () => this.internalStorageService.getSnapshotTree(version),
			"storage_getSnapshotTree",
		);
	}

	public async getSnapshot(snapshotFetchOptions?: ISnapshotFetchOptions): Promise<ISnapshot> {
		return this.runWithRetry(async () => {
			if (this.internalStorageService.getSnapshot !== undefined) {
				return this.internalStorageService.getSnapshot(snapshotFetchOptions);
			}
			throw new UsageError("getSnapshot should exist in storage adapter in ODSP driver");
		}, "storage_getSnapshot");
	}

	public async readBlob(id: string): Promise<ArrayBufferLike> {
		return this.runWithRetry(
			async () => this.internalStorageService.readBlob(id),
			"storage_readBlob",
		);
	}

	public async getVersions(
		// eslint-disable-next-line @rushstack/no-new-null
		versionId: string | null,
		count: number,
		scenarioName?: string,
		fetchSource?: FetchSource,
	): Promise<IVersion[]> {
		return this.runWithRetry(
			async () =>
				this.internalStorageService.getVersions(
					versionId,
					count,
					scenarioName,
					fetchSource,
				),
			"storage_getVersions",
		);
	}

	public async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		// Creation flow with attachment blobs - need to do retries!
		return this.runWithRetry(
			async () => this.internalStorageService.uploadSummaryWithContext(summary, context),
			"storage_uploadSummaryWithContext",
		);
	}

	public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
		return this.runWithRetry(
			async () => this.internalStorageService.downloadSummary(handle),
			"storage_downloadSummary",
		);
	}

	public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		return this.runWithRetry(
			async () => this.internalStorageService.createBlob(file),
			"storage_createBlob",
		);
	}

	private checkStorageDisposed(): void {
		if (this._disposed) {
			// pre-0.58 error message: storageServiceDisposedCannotRetry
			throw new LoggingError("Storage Service is disposed. Cannot retry", {
				canRetry: false,
			});
		}
	}

	private async runWithRetry<T>(api: () => Promise<T>, callName: string): Promise<T> {
		return runWithRetry(api, callName, this.logger, () => this.checkStorageDisposed());
	}
}
