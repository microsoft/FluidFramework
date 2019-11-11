/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@microsoft/fluid-protocol-definitions";
import { OdspDocumentStorageManager } from "./OdspDocumentStorageManager";

/**
 * Document access to underlying storage for sharepoint driver.
 */
export class OdspDocumentStorageService implements api.IDocumentStorageService {
    constructor(private readonly storageManager: OdspDocumentStorageManager) { }

    public uploadSummary(commit: api.ISummaryTree, context: api.ISummaryContext): Promise<api.ISummaryHandle> {
        this.hydrateSummaryHandles(commit, context.ackedParentHandle);
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

    private hydrateSummaryHandles(commit: api.ISummaryTree, prefix?: string) {
        for (const [key, value] of Object.entries(commit.tree)) {
            switch (value.type) {
                case api.SummaryType.Tree: {
                    this.hydrateSummaryHandles(value, prefix ? `${prefix}/${key}` : undefined);
                    break;
                }
                case api.SummaryType.Handle: {
                    if (!prefix) {
                        throw Error("Expected parent handle");
                    }
                    value.handle = `${prefix}/${key}`;
                    break;
                }
                default: {}
            }
        }
    }
}
