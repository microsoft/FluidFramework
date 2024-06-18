/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
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
import { runWithRetry } from "@fluidframework/driver-utils/internal";
import {
	ITelemetryLoggerExt,
	GenericError,
	UsageError,
} from "@fluidframework/telemetry-utils/internal";

export class RetriableDocumentStorageService implements IDocumentStorageService, IDisposable {
	private _disposed = false;
	private internalStorageService: IDocumentStorageService | undefined;
	constructor(
		private readonly internalStorageServiceP: Promise<IDocumentStorageService>,
		private readonly logger: ITelemetryLoggerExt,
	) {
		this.internalStorageServiceP.then((s) => (this.internalStorageService = s)).catch(() => {});
	}

	public get policies(): IDocumentStorageServicePolicies | undefined {
		if (this.internalStorageService) {
			return this.internalStorageService.policies;
		}
		throw new Error("storage service not yet instantiated");
	}
	public get disposed() {
		return this._disposed;
	}
	public dispose() {
		this._disposed = true;
	}

	public async getSnapshotTree(
		version?: IVersion,
		scenarioName?: string,
	): Promise<ISnapshotTree | null> {
		return this.runWithRetry(
			async () =>
				this.internalStorageServiceP.then(async (s) =>
					s.getSnapshotTree(version, scenarioName),
				),
			"storage_getSnapshotTree",
		);
	}

	public async getSnapshot(snapshotFetchOptions?: ISnapshotFetchOptions): Promise<ISnapshot> {
		return this.runWithRetry(
			async () =>
				this.internalStorageServiceP.then(async (s) => {
					if (s.getSnapshot !== undefined) {
						return s.getSnapshot(snapshotFetchOptions);
					}
					throw new UsageError(
						"getSnapshot api should exist on internal storage in RetriableDocStorageService class",
					);
				}),
			"storage_getSnapshot",
		);
	}

	public async readBlob(id: string): Promise<ArrayBufferLike> {
		return this.runWithRetry(
			async () => this.internalStorageServiceP.then(async (s) => s.readBlob(id)),
			"storage_readBlob",
		);
	}

	public async getVersions(
		versionId: string | null,
		count: number,
		scenarioName?: string,
		fetchSource?: FetchSource,
	): Promise<IVersion[]> {
		return this.runWithRetry(
			async () =>
				this.internalStorageServiceP.then(async (s) =>
					s.getVersions(versionId, count, scenarioName, fetchSource),
				),
			"storage_getVersions",
		);
	}

	public async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		// Not using retry loop here. Couple reasons:
		// 1. If client lost connectivity, then retry loop will result in uploading stale summary
		//    by stale summarizer after connectivity comes back. It will cause failures for this client and for
		//    real (new) summarizer. This problem in particular should be solved in future by supplying abort handle
		//    on all APIs and caller (ContainerRuntime.submitSummary) aborting call on loss of connectivity
		// 2. Similar, if we get 429 with retryAfter = 10 minutes, it's likely not the right call to retry summary
		//    upload in 10 minutes - it's better to keep processing ops and retry later. Though caller needs to take
		//    retryAfter into account!
		// But retry loop is required for creation flow (Container.attach)
		assert(
			(context.referenceSequenceNumber === 0) === (context.ackHandle === undefined),
			0x251 /* "creation summary has to have seq=0 && handle === undefined" */,
		);
		if (context.referenceSequenceNumber !== 0) {
			return this.internalStorageServiceP.then(async (s) =>
				s.uploadSummaryWithContext(summary, context),
			);
		}

		// Creation flow with attachment blobs - need to do retries!
		return this.runWithRetry(
			async () =>
				this.internalStorageServiceP.then(async (s) =>
					s.uploadSummaryWithContext(summary, context),
				),
			"storage_uploadSummaryWithContext",
		);
	}

	public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
		return this.runWithRetry(
			async () => this.internalStorageServiceP.then(async (s) => s.downloadSummary(handle)),
			"storage_downloadSummary",
		);
	}

	public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		return this.runWithRetry(
			async () => this.internalStorageServiceP.then(async (s) => s.createBlob(file)),
			"storage_createBlob",
		);
	}

	private checkStorageDisposed(callName: string, error: unknown) {
		if (this._disposed) {
			this.logger.sendTelemetryEvent(
				{
					eventName: `${callName}_abortedStorageDisposed`,
					fetchCallName: callName, // fetchCallName matches logs in runWithRetry.ts
				},
				error,
			);
			// pre-0.58 error message: storageServiceDisposedCannotRetry
			throw new GenericError("Storage Service is disposed. Cannot retry", {
				canRetry: false,
			});
		}
		return;
	}

	private async runWithRetry<T>(api: () => Promise<T>, callName: string): Promise<T> {
		return runWithRetry(api, callName, this.logger, {
			onRetry: (_delayInMs: number, error: unknown) =>
				this.checkStorageDisposed(callName, error),
		});
	}
}
