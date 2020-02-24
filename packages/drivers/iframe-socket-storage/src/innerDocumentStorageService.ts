/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";
import {
    ICreateBlobResponse,
    ISnapshotTree,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    IVersion,
} from "@microsoft/fluid-protocol-definitions";
import { Remote } from "comlink";

/**
 * Document access to underlying storage for routerlicious driver.
 */
export class InnerDocumentStorageService implements IDocumentStorageService {
    public get repositoryUrl(): string {
        return this.outerStorageService.repositoryUrl;
    }

    constructor(private readonly outerStorageService: Remote<IDocumentStorageService>) {
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        return this.outerStorageService.getSnapshotTree(version);
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        const versions = await this.outerStorageService.getVersions(versionId, count);
        if (versions === undefined) {
            return [];
        }
        return versions;
    }

    public async read(blobId: string): Promise<string> {
        const blob = await this.outerStorageService.read(blobId);
        return blob;
    }

    public async getContent(version: IVersion, path: string): Promise<string> {
        return this.outerStorageService.getContent(version, path);
    }

    public async write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        return this.outerStorageService.write(tree, parents, message, ref);
    }

    public async uploadSummary(commit: ISummaryTree): Promise<ISummaryHandle> {
        return this.outerStorageService.uploadSummary(commit);

    }

    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return this.outerStorageService.downloadSummary(handle);
    }

    public async createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        return this.outerStorageService.createBlob(file);
    }

    public getRawUrl(blobId: string): string {
        throw new Error("getRawUrl not proxible");
        // return this.outerStorageService.getRawUrl(blobId);
    }
}
