/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService } from "@microsoft/fluid-container-definitions";
import * as api from "@microsoft/fluid-protocol-definitions";
import { OdspDocumentStorageManager } from "./OdspDocumentStorageManager";

/**
 * Document access to underlying storage for sharepoint driver.
 */
export class OdspDocumentStorageService implements IDocumentStorageService {
    constructor(private readonly storageManager: OdspDocumentStorageManager) { }

    public uploadSummary(commit: api.ISummaryTree): Promise<api.ISummaryHandle> {
        return this.storageManager.uploadSummary(commit);
    }

    public downloadSummary(handle: api.ISummaryHandle): Promise<api.ISummaryTree> {
        return this.storageManager.downloadSummary(handle);
    }

    public get repositoryUrl(): string {
        return "";
    }

    public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
        return this.storageManager.getTree(version);
    }

    public async getVersions(commitId: string | null, count: number): Promise<api.IVersion[]> {
        return this.storageManager.getVersions(commitId, count);
    }

    public async read(sha: string): Promise<string> {
        const response = await this.storageManager.getBlob(sha);
        return response.content;
    }

    public async getContent(version: api.IVersion, path: string): Promise<string> {
        const response = await this.storageManager.getContent(version, path);
        return response.content;
    }

    public write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion> {
        return this.storageManager.write(tree, parents, message);
    }

    public async createBlob(file: Buffer | undefined | null): Promise<api.ICreateBlobResponse> {
        return this.storageManager.createBlob(file!);
    }

    public getRawUrl(sha: string): string {
        return this.storageManager.getRawUrl(sha);
    }
}
