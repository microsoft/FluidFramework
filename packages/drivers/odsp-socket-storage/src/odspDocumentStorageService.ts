/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService, ISummaryContext } from "@microsoft/fluid-driver-definitions";
import * as api from "@microsoft/fluid-protocol-definitions";
import { OdspDocumentStorageManager } from "./odspDocumentStorageManager";

/**
 * Document access to underlying storage for sharepoint driver.
 */
export class OdspDocumentStorageService implements IDocumentStorageService {
    constructor(private readonly storageManager: OdspDocumentStorageManager) { }

    // back-compat: 0.14 uploadSummary
    public async uploadSummary(commit: api.ISummaryTree): Promise<api.ISummaryHandle> {
        return this.storageManager.uploadSummary(commit);
    }

    public async uploadSummaryWithContext(summary: api.ISummaryTree, context: ISummaryContext): Promise<string> {
        return this.storageManager.uploadSummaryWithContext(summary, context);
    }

    public async downloadSummary(handle: api.ISummaryHandle): Promise<api.ISummaryTree> {
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

    public async write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion> {
        return this.storageManager.write(tree, parents, message);
    }

    public async createBlob(file: Buffer | undefined | null): Promise<api.ICreateBlobResponse> {
        return this.storageManager.createBlob(file!);
    }

    public getRawUrl(sha: string): string {
        return this.storageManager.getRawUrl(sha);
    }
}
