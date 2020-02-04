/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";
import * as api from "@microsoft/fluid-protocol-definitions";

/**
 * Document storage service for the faux driver.
 */
export class CreationDocumentStorageService implements IDocumentStorageService {

    constructor() {
    }

    public get repositoryUrl(): string {
        return "";
    }

    public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
        return null;
    }

    public async getVersions(versionId: string, count: number): Promise<api.IVersion[]> {
        return [];
    }

    public async getContent(version: api.IVersion, path: string): Promise<string> {
        throw new Error("Not implemented.");
    }

    public async read(sha: string): Promise<string> {
        throw new Error("Not implemented.");
    }

    public async write(root: api.ITree, parents: string[], message: string, ref: string): Promise<api.IVersion> {
        throw new Error("Not implemented.");
    }

    public async createBlob(file: Buffer): Promise<api.ICreateBlobResponse> {
        throw new Error("Not implemented.");
    }

    public getRawUrl(blobId: string): string {
        return "";
    }

    public async uploadSummary(commit: api.ISummaryTree): Promise<api.ISummaryHandle> {
        throw new Error("Not implemented.");
    }

    public async downloadSummary(handle: api.ISummaryHandle): Promise<api.ISummaryTree> {
        throw new Error("Not implemented.");
    }
}
