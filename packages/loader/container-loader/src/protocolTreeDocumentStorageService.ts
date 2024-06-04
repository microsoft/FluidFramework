/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@fluidframework/core-interfaces";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	IDocumentStorageService,
	ISummaryContext,
} from "@fluidframework/driver-definitions/internal";

/**
 * A storage service wrapper whose sole job is to intercept calls to uploadSummaryWithContext and ensure they include
 * the protocol summary, using the provided callback to add it if necessary.
 */
export class ProtocolTreeStorageService implements IDocumentStorageService, IDisposable {
	constructor(
		private readonly internalStorageService: IDocumentStorageService & IDisposable,
		private readonly addProtocolSummaryIfMissing: (summaryTree: ISummaryTree) => ISummaryTree,
	) {}
	public get policies() {
		return this.internalStorageService.policies;
	}
	public get disposed() {
		return this.internalStorageService.disposed;
	}

	getSnapshotTree = this.internalStorageService.getSnapshotTree.bind(this.internalStorageService);
	getSnapshot = this.internalStorageService.getSnapshot?.bind(this.internalStorageService);
	getVersions = this.internalStorageService.getVersions.bind(this.internalStorageService);
	createBlob = this.internalStorageService.createBlob.bind(this.internalStorageService);
	readBlob = this.internalStorageService.readBlob.bind(this.internalStorageService);
	downloadSummary = this.internalStorageService.downloadSummary.bind(this.internalStorageService);
	dispose = this.internalStorageService.dispose.bind(this.internalStorageService);

	async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		return this.internalStorageService.uploadSummaryWithContext(
			this.addProtocolSummaryIfMissing(summary),
			context,
		);
	}
}
