/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/container-definitions";
import { IReplayController } from "./replayController";

/**
 * Document storage service for the replay driver...just does a default implementation for
 * all the methods
 */
export class ReplayDocumentStorageService implements api.IDocumentStorageService  {
    public constructor(
            private readonly documentStorageService: api.IDocumentStorageService,
            private readonly controller: IReplayController) {
    }

    public get repositoryUrl(): string {
        return this.documentStorageService.repositoryUrl;
    }

    public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
        return this.controller.getSnapshotTree(this.documentStorageService, version);
    }

    public async getVersions(versionId: string, count: number): Promise<api.IVersion[]> {
        return this.controller.getVersions(this.documentStorageService, versionId, count);
    }

    public async read(blobId: string): Promise<string> {
        return this.controller.read(this.documentStorageService, blobId);
    }

    public uploadSummary(commit: api.ISummaryTree): Promise<api.ISummaryHandle> {
        return Promise.reject("Invalid operation");
    }

    public async getContent(version: api.IVersion, path: string): Promise<string> {
        return this.documentStorageService.getContent(version, path);
    }

    public async write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion> {
        return Promise.reject("Invalid operation");
    }

    public async createBlob(file: Buffer): Promise<api.ICreateBlobResponse> {
        return Promise.reject("Invalid operation");
    }

    public downloadSummary(handle: api.ISummaryHandle): Promise<api.ISummaryTree> {
        return Promise.reject("Invalid operation");
    }

    public getRawUrl(blobId: string): string {
        return this.documentStorageService.getRawUrl(blobId);
    }
}
