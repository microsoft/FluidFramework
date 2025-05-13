/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISummaryTree, ISummaryHandle } from "@fluidframework/driver-definitions";
import {
	IDocumentStorageService,
	ISummaryContext,
	IVersion,
	ISnapshotTree,
	ICreateBlobResponse,
} from "@fluidframework/driver-definitions/internal";

/**
 * Document access to underlying storage. It is default implementation of a storage service.
 * Does not read/write anything.
 */
export class NullBlobStorageService implements IDocumentStorageService {
	public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
		return version ? Promise.reject(new Error("Invalid operation")) : null;
	}

	public async getVersions(versionId: string | null, count: number): Promise<IVersion[]> {
		return [];
	}

	public async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		throw new Error("Invalid operation");
	}

	public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
		throw new Error("Invalid operation");
	}

	public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		throw new Error("Null blob storage can not create blob");
	}
	public async readBlob(blobId: string): Promise<ArrayBufferLike> {
		throw new Error("Null blob storage can not read blob");
	}
}
