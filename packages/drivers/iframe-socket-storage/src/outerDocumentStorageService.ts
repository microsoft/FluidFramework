/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICreateBlobResponse,
    IDocumentStorageService,
    ISnapshotTree,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    IVersion,
} from "@prague/protocol-definitions";

export interface IOuterDocumentStorage {
    getVersions(versionId: string, count: number): Promise<IVersion[]>;
    getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null>;
    read(blobId: string): Promise<string>;
}

/**
 * Document access to underlying storage for routerlicious driver.
 */
export class OuterDocumentStorageService implements IDocumentStorageService {
    public get repositoryUrl(): string {
        return "";
    }

    constructor() {
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        return Promise.reject(new Error("OuterDocumentStorageService: getSnapshotTree not implemented on outer frame"));
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        // return this.documentStorageService.getVersions(versionId, count);
        return Promise.reject(new Error("OuterDocumentStorageService: getVersions not implemented on outer frame"));
    }

    public async read(blobId: string): Promise<string> {
        return Promise.reject(new Error("OuterDocumentStorageService: read not implemented on outer frame"));
    }

    public async getContent(version: IVersion, path: string): Promise<string> {
        return Promise.reject(new Error("OuterDocumentStorageService: getContent not implemented on outer frame"));
    }

    public write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        return Promise.reject(new Error("OuterDocumentStorageService: write not implemented on outer frame"));
    }

    public async uploadSummary(commit: ISummaryTree): Promise<ISummaryHandle> {
        return Promise.reject(new Error("OuterDocumentStorageService: uploadSummary not implemented on outer frame"));
    }

    public downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return Promise.reject("NOT IMPLEMENTED!");
    }

    public async createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        return Promise.reject(new Error("OuterDocumentStorageService: createBlob not implemented on outer frame"));
    }

    public getRawUrl(blobId: string): string {
        throw new Error("OuterDocumentStorageService: getRawUrl not implemented on outer frame");
    }
}
