/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/container-definitions";
import { buildHierarchy } from "@prague/utils";
import { SharepointDocumentStorageManager } from "./SharepointDocumentStorageManager";

/**
 * Document access to underlying storage for sharepoint driver.
 */
export class SharepointDocumentStorageService implements api.IDocumentStorageService {
    constructor(private readonly storageManager: SharepointDocumentStorageManager) { }

    public uploadSummary(commit: api.ISummaryTree): Promise<api.ISummaryHandle> {
        throw new Error("Method not implemented.");
    }

    public downloadSummary(handle: api.ISummaryHandle): Promise<api.ISummaryTree> {
        throw new Error("Method not implemented.");
    }

    public get repositoryUrl(): string {
        return "";
    }

    public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
        const tree = await this.storageManager.getTree(version);
        if (tree) {
            return buildHierarchy(tree);
        }
        return (null as any) as api.ISnapshotTree;
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
