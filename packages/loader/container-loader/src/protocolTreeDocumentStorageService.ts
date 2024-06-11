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
	) {
		this.getSnapshotTree = internalStorageService.getSnapshotTree.bind(internalStorageService);
		this.getSnapshot = internalStorageService.getSnapshot?.bind(internalStorageService);
		this.getVersions = internalStorageService.getVersions.bind(internalStorageService);
		this.createBlob = internalStorageService.createBlob.bind(internalStorageService);
		this.readBlob = internalStorageService.readBlob.bind(internalStorageService);
		this.downloadSummary = internalStorageService.downloadSummary.bind(internalStorageService);
		this.dispose = internalStorageService.dispose.bind(internalStorageService);
	}
	public get policies() {
		return this.internalStorageService.policies;
	}
	public get disposed() {
		return this.internalStorageService.disposed;
	}

	getSnapshotTree: IDocumentStorageService["getSnapshotTree"];
	getSnapshot: IDocumentStorageService["getSnapshot"];
	getVersions: IDocumentStorageService["getVersions"];
	createBlob: IDocumentStorageService["createBlob"];
	readBlob: IDocumentStorageService["readBlob"];
	downloadSummary: IDocumentStorageService["downloadSummary"];
	dispose: IDisposable["dispose"];

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
