/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDisposable } from "@fluidframework/core-interfaces";
import type { ISummaryHandle, ISummaryTree } from "@fluidframework/driver-definitions";
import type {
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
	LoggingError,
	type TelemetryLoggerExt,
	UsageError,
} from "@fluidframework/telemetry-utils/internal";

import { runWithRetry } from "./retryUtils.js";
import { disposeOdspOperations, OdspOperation } from "./odspOperation.js";

interface StorageWithOperation extends IDocumentStorageService {
	getSnapshotTree(
		version?: IVersion,
		scenarioName?: string,
		operation?: OdspOperation,
		// eslint-disable-next-line @rushstack/no-new-null
	): Promise<ISnapshotTree | null>;
	getSnapshot?(options?: ISnapshotFetchOptions, operation?: OdspOperation): Promise<ISnapshot>;
	readBlob(id: string, operation?: OdspOperation): Promise<ArrayBufferLike>;
	getVersions(
		// eslint-disable-next-line @rushstack/no-new-null
		id: string | null,
		count: number,
		scenarioName?: string,
		source?: FetchSource,
		operation?: OdspOperation,
	): Promise<IVersion[]>;
	uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
		operation?: OdspOperation,
	): Promise<string>;
	downloadSummary(handle: ISummaryHandle, operation?: OdspOperation): Promise<ISummaryTree>;
	createBlob(file: ArrayBufferLike, operation?: OdspOperation): Promise<ICreateBlobResponse>;
}

export class RetryErrorsStorageAdapter implements IDocumentStorageService, IDisposable {
	private _disposed = false;
	constructor(
		private readonly internalStorageService: StorageWithOperation,
		private readonly logger: TelemetryLoggerExt,
		private readonly signal?: AbortSignal,
	) {}

	public get policies(): IDocumentStorageServicePolicies | undefined {
		return this.internalStorageService.policies;
	}
	public get disposed(): boolean {
		return this._disposed;
	}
	public dispose(): void {
		this._disposed = true;
		disposeOdspOperations(this);
	}

	// eslint-disable-next-line @rushstack/no-new-null
	public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
		return this.runWithRetry(
			async (operation) =>
				this.internalStorageService.getSnapshotTree(version, undefined, operation),
			"storage_getSnapshotTree",
			version?.id,
		);
	}

	public async getSnapshot(snapshotFetchOptions?: ISnapshotFetchOptions): Promise<ISnapshot> {
		return this.runWithRetry(
			async (operation) => {
				if (this.internalStorageService.getSnapshot !== undefined) {
					return this.internalStorageService.getSnapshot(snapshotFetchOptions, operation);
				}
				throw new UsageError("getSnapshot should exist in storage adapter in ODSP driver");
			},
			"storage_getSnapshot",
			JSON.stringify(snapshotFetchOptions?.loadingGroupIds ?? []),
		);
	}

	public async readBlob(id: string): Promise<ArrayBufferLike> {
		return this.runWithRetry(
			async (operation) => this.internalStorageService.readBlob(id, operation),
			"storage_readBlob",
			id,
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
			async (operation) =>
				this.internalStorageService.getVersions(
					versionId,
					count,
					scenarioName,
					fetchSource,
					operation,
				),
			"storage_getVersions",
			versionId ?? undefined,
		);
	}

	public async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		// Creation flow with attachment blobs - need to do retries!
		return this.runWithRetry(
			async (operation) =>
				this.internalStorageService.uploadSummaryWithContext(summary, context, operation),
			"storage_uploadSummaryWithContext",
		);
	}

	public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
		return this.runWithRetry(
			async (operation) => this.internalStorageService.downloadSummary(handle, operation),
			"storage_downloadSummary",
			handle.handle,
		);
	}

	public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		return this.runWithRetry(
			async (operation) => this.internalStorageService.createBlob(file, operation),
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

	private async runWithRetry<T>(
		api: (operation: OdspOperation) => Promise<T>,
		callName: string,
		target = "document",
	): Promise<T> {
		const operation = new OdspOperation(
			this.logger,
			this,
			callName,
			target,
			undefined,
			this.signal,
			this.internalStorageService,
		);
		return operation.run(async () =>
			runWithRetry(
				async () => api(operation),
				callName,
				operation.logger,
				() => this.checkStorageDisposed(),
				operation,
			),
		);
	}
}
