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

export interface IOuterDocumentServiceProxy {
    getSnapshotTree(version?: IVersion): Promise<ISnapshotTree>;
    getVersions(versionId: string | null, count: number): Promise<IVersion[]>;
    read(blobId: string): Promise<string>;
}

/**
 * Document access to underlying storage for routerlicious driver.
 */
export class InnerDocumentStorageService implements IDocumentStorageService  {
    public get repositoryUrl(): string {
        return "";
    }

    constructor(private readonly outerStorageService: IOuterDocumentServiceProxy) {
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        return this.outerStorageService.getSnapshotTree(version);
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        const versions = await this.outerStorageService.getVersions(versionId, count);
        return versions;
    }

    public async read(blobId: string): Promise<string> {
        const blob =  await this.outerStorageService.read(blobId);
        return blob;
    }

    public async getContent(version: IVersion, path: string): Promise<string> {
        return Promise.reject(new Error("InnerDocumentStorageService: getContent not implemented"));
    }

    public write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        return Promise.reject(new Error("InnerDocumentStorageService: write not implemented"));
    }

    public async uploadSummary(commit: ISummaryTree): Promise<ISummaryHandle> {
        return Promise.reject(new Error("InnerDocumentStorageService: uploadSummary not implemented"));

    }

    public downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return Promise.reject(new Error("InnerDocumentStorageService: downloadSummary not implemented"));
    }

    public async createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        return Promise.reject(new Error("InnerDocumentStorageService: createBlob not implemented"));
    }

    public getRawUrl(blobId: string): string {
        throw new Error("InnerDocumentStorageService: getRawUrl not implemented");
    }
}
