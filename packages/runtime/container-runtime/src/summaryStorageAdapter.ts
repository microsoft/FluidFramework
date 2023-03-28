/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
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
 * This class is a base class for building the classes which use the
 * Delegation Pattern to intercept methods of IDocumentStorageService implementation.
 * Those extended classes can add the postprocessing of summary data structures prior sending to Fluid Server
 * and preprocessing of summary data structures received from Fluid Server.
 */
export class SummaryStorageAdapter implements IDocumentStorageService {
	public get service() {
		return this._service;
	}

	constructor(private readonly _service: IDocumentStorageService) {}
	public get repositoryUrl(): string {
		return this._service.repositoryUrl;
	}
	public get policies(): IDocumentStorageServicePolicies | undefined {
		return this._service.policies;
	}
	public async getSnapshotTree(
		version?: IVersion | undefined,
		scenarioName?: string | undefined,
	): Promise<ISnapshotTree | null> {
		return this._service.getSnapshotTree(version, scenarioName);
	}
	public async getVersions(
		versionId: string | null,
		count: number,
		scenarioName?: string | undefined,
	): Promise<IVersion[]> {
		return this._service.getVersions(versionId, count, scenarioName);
	}
	public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		return this._service.createBlob(file);
	}
	public async readBlob(id: string): Promise<ArrayBufferLike> {
		return this._service.readBlob(id);
	}
	public async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		return this._service.uploadSummaryWithContext(summary, context);
	}
	public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
		return this._service.downloadSummary(handle);
	}
}
