/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@fluidframework/core-interfaces";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	IDocumentStorageService,
	ISummaryContext,
	type IDocumentStorageServicePolicies,
} from "@fluidframework/driver-definitions/internal";

/**
 * A storage service wrapper whose sole job is to intercept calls to uploadSummaryWithContext and ensure they include
 * the protocol summary, using the provided callback to add it if necessary.
 */
export class ProtocolTreeStorageService implements IDocumentStorageService, IDisposable {
	/**
	 *
	 * @param internalStorageService - Document storage service responsible to make api calls to the storage.
	 * @param addProtocolSummaryIfMissing - Function to add protocol summary tree to the summary. Used in scenarios where single-commit summaries are used.
	 * @param shouldSummarizeProtocolTree - Callback function to learn about the service preference on whether single-commit summaries are enabled.
	 */
	constructor(
		private readonly internalStorageService: IDocumentStorageService & IDisposable,
		private readonly addProtocolSummaryIfMissing: (summaryTree: ISummaryTree) => ISummaryTree,
		private readonly shouldSummarizeProtocolTree: () => boolean,
	) {
		this.getSnapshotTree = internalStorageService.getSnapshotTree.bind(internalStorageService);
		this.getSnapshot = internalStorageService.getSnapshot?.bind(internalStorageService);
		this.getVersions = internalStorageService.getVersions.bind(internalStorageService);
		this.createBlob = internalStorageService.createBlob.bind(internalStorageService);
		this.readBlob = internalStorageService.readBlob.bind(internalStorageService);
		this.downloadSummary = internalStorageService.downloadSummary.bind(internalStorageService);
		this.dispose = internalStorageService.dispose.bind(internalStorageService);
	}
	public get policies(): IDocumentStorageServicePolicies | undefined {
		return this.internalStorageService.policies;
	}
	public get disposed(): boolean {
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
		return this.shouldSummarizeProtocolTree()
			? this.internalStorageService.uploadSummaryWithContext(
					this.addProtocolSummaryIfMissing(summary),
					context,
				)
			: this.internalStorageService.uploadSummaryWithContext(summary, context);
	}
}
