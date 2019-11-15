/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService } from "@microsoft/fluid-container-definitions";
import * as api from "@microsoft/fluid-protocol-definitions";

/**
 * Document access to underlying storage. It is default implementation of a storage service.
 * Does not read/write anything.
 */
export class NullBlobStorageService implements IDocumentStorageService  {
    public get repositoryUrl(): string {
        throw new Error("Invalid operation");
    }

    public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
        return version ? Promise.reject("Invalid operation") : null;
    }

    public async getVersions(versionId: string, count: number): Promise<api.IVersion[]> {
        return [];
    }

    public async read(blobId: string): Promise<string> {
        return Promise.reject("Invalid operation");
    }

    public async getContent(version: api.IVersion, path: string): Promise<string> {
        return Promise.reject("Invalid operation");
    }

    public write(tree: api.ITree, parents: string[], message: string, ref: string): Promise<api.IVersion> {
        return Promise.reject("Null blob storage can not write commit");
    }

    public uploadSummary(commit: api.ISummaryTree): Promise<api.ISummaryHandle> {
        return Promise.reject("Invalid operation");
    }

    public downloadSummary(handle: api.ISummaryHandle): Promise<api.ISummaryTree> {
        return Promise.reject("Invalid operation");
    }

    public async createBlob(file: Buffer): Promise<api.ICreateBlobResponse> {
        return Promise.reject("Null blob storage can not create blob");
    }

    public getRawUrl(blobId: string): string {
        throw new Error("Invalid operation");
    }
}
