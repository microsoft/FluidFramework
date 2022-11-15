/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as git from "@fluidframework/gitresources";
import type * as protocol from "@fluidframework/protocol-definitions";
import {
    IGitManager,
    IWholeFlatSummary,
    IWholeSummaryPayload,
    IWriteSummaryResponse,
} from "@fluidframework/server-services-client";
import { runWithRetry } from "@fluidframework/driver-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";

export class RetriableGitManager implements IGitManager {
    constructor(
        private readonly internalGitManager: IGitManager,
        private readonly logger: ITelemetryLogger,
    ) {
    }

    public async getHeader(id: string, sha: string): Promise<protocol.ISnapshotTree> {
        return this.runWithRetry(
            async () => this.internalGitManager.getHeader(id, sha),
            "gitManager_getHeader",
        );
    }

    public async getFullTree(sha: string): Promise<any> {
        return this.runWithRetry(
            async () => this.internalGitManager.getFullTree(sha),
            "gitManager_getFullTree",
        );
    }

    public async getCommit(sha: string): Promise<git.ICommit> {
        return this.runWithRetry(
            async () => this.internalGitManager.getCommit(sha),
            "gitManager_getCommit",
        );
    }

    public async getCommits(sha: string, count: number): Promise<git.ICommitDetails[]> {
        return this.runWithRetry(
            async () => this.internalGitManager.getCommits(sha, count),
            "gitManager_getCommits",
        );
    }

    public async getTree(root: string, recursive: boolean): Promise<git.ITree> {
        return this.runWithRetry(
            async () => this.internalGitManager.getTree(root, recursive),
            "gitManager_getTree",
        );
    }

    public async getBlob(sha: string): Promise<git.IBlob> {
        return this.runWithRetry(
            async () => this.internalGitManager.getBlob(sha),
            "gitManager_getBlob",
        );
    }

    public getRawUrl(sha: string): string {
        return this.internalGitManager.getRawUrl(sha);
    }

    public async getContent(commit: string, path: string): Promise<git.IBlob> {
        return this.runWithRetry(
            async () => this.internalGitManager.getContent(commit, path),
            "gitManager_getContent",
        );
    }

    public async createBlob(content: string, encoding: string): Promise<git.ICreateBlobResponse> {
        return this.runWithRetry(
            async () => this.internalGitManager.createBlob(content, encoding),
            "gitManager_createBlob",
        );
    }

    public async createGitTree(params: git.ICreateTreeParams): Promise<git.ITree> {
        return this.runWithRetry(
            async () => this.internalGitManager.createGitTree(params),
            "gitManager_createGitTree",
        );
    }

    public async createTree(files: protocol.ITree): Promise<git.ITree> {
        return this.runWithRetry(
            async () => this.internalGitManager.createTree(files),
            "gitManager_createTree",
        );
    }

    public async createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit> {
        return this.runWithRetry(
            async () => this.internalGitManager.createCommit(commit),
            "gitManager_createCommit",
        );
    }

    public async getRef(ref: string): Promise<git.IRef> {
        return this.runWithRetry(
            async () => this.internalGitManager.getRef(ref),
            "gitManager_getRef",
        );
    }

    public async createRef(branch: string, sha: string): Promise<git.IRef> {
        return this.runWithRetry(
            async () => this.internalGitManager.createRef(branch, sha),
            "gitManager_createRef",
        );
    }

    public async upsertRef(branch: string, commitSha: string): Promise<git.IRef> {
        return this.runWithRetry(
            async () => this.internalGitManager.upsertRef(branch, commitSha),
            "gitManager_upsertRef",
        );
    }

    public async write(branch: string,
        inputTree: protocol.ITree,
        parents: string[],
        message: string): Promise<git.ICommit> {
        return this.runWithRetry(
            async () => this.internalGitManager.write(branch, inputTree, parents, message),
            "gitManager_write",
        );
    }

    public async createSummary(summary: IWholeSummaryPayload): Promise<IWriteSummaryResponse> {
        return this.runWithRetry(
            async () => this.internalGitManager.createSummary(summary),
            "gitManager_createSummary",
        );
    }

    public async deleteSummary(softDelete: boolean): Promise<void> {
        return this.runWithRetry(
            async () => this.internalGitManager.deleteSummary(softDelete),
            "gitManager_deleteSummary",
        );
    }

    public async getSummary(sha: string): Promise<IWholeFlatSummary> {
        return this.runWithRetry(
            async () => this.internalGitManager.getSummary(sha),
            "gitManager_getSummary",
        );
    }

    private async runWithRetry<T>(api: () => Promise<T>, callName: string): Promise<T> {
        return runWithRetry(
            api,
            callName,
            this.logger,
            {}, // progress
        );
    }
}
