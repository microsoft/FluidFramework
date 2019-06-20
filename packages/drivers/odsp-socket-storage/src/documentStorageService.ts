/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/container-definitions";
import { buildHierarchy } from "@prague/utils";
import { IDocumentStorageManager } from "./standardDocumentStorageManager";

/**
 * Document access to underlying storage for legacy odsp driver..
 * The current implementation of this aligns with SPO's implementation of SnapShot
 */
export class DocumentStorageService implements api.IDocumentStorageService {
    public get repositoryUrl(): string {
        return "";
    }

    constructor(private readonly storageManager: IDocumentStorageManager) {
    }

    public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
        const tree = await this.storageManager.getTree(version);
        if (!tree) {
            return null;
        }

        const hierarchicalTree = buildHierarchy(tree);

        // decode commit paths
        const commits = {};

        const keys = Object.keys(hierarchicalTree.commits);
        for (const key of keys) {
            commits[decodeURIComponent(key)] = hierarchicalTree.commits[key];
        }

        hierarchicalTree.commits = commits;

        return hierarchicalTree;
    }

    public async getVersions(versionId: string, count: number): Promise<api.IVersion[]> {
        return this.storageManager.getVersions(versionId, count);
    }

    public async read(blobId: string): Promise<string> {
        const response = await this.storageManager.getBlob(blobId);
        return response.content;
    }

    public async getContent(version: api.IVersion, path: string): Promise<string> {
        const response = await this.storageManager.getContent(version, path);
        return response.content;
    }

    public write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion> {
        return this.storageManager.write(tree, parents, message);
    }

    public uploadSummary(commit: api.ISummaryTree): Promise<api.ISummaryHandle> {
        return Promise.reject("NOT IMPLEMENTED!");
    }

    public downloadSummary(commit: api.ISummaryHandle): Promise<api.ISummaryTree> {
        return Promise.reject("NOT IMPLEMENTED!");
    }

    public async createBlob(file: Buffer): Promise<api.ICreateBlobResponse> {
        return this.storageManager.createBlob(file);
    }

    public getRawUrl(blobId: string): string {
        return this.storageManager.getRawUrl(blobId);
    }
}
