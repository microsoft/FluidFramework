/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as git from "@fluidframework/gitresources";
import { IExternalWriterConfig, IRepositoryManager } from "./definitions";
import { BaseGitRestTelemetryProperties, GitRestLumberEventName } from "./gitrestTelemetryDefinitions";
import { executeApiWithMetric } from "./helpers";

export abstract class RepositoryManagerBase implements IRepositoryManager {
    constructor(
        protected readonly directory: string,
        protected readonly lumberjackBaseProperties: Record<string, any>,
        private readonly enableRepositoryManagerMetrics: boolean = false,
    ) { }

    protected abstract getCommitCore(sha: string): Promise<git.ICommit>;
    protected abstract getCommitsCore(sha: string, count: number, externalWriterConfig?: IExternalWriterConfig): Promise<git.ICommitDetails[]>;
    protected abstract getTreeCore(root: string, recursive: boolean): Promise<git.ITree>;
    protected abstract getBlobCore(sha: string): Promise<git.IBlob>;
    protected abstract getContentCore(commit: string, path: string): Promise<git.IBlob>;
    protected abstract createBlobCore(createBlobParams: git.ICreateBlobParams): Promise<git.ICreateBlobResponse>;
    protected abstract createTreeCore(params: git.ICreateTreeParams): Promise<git.ITree>;
    protected abstract createCommitCore(commit: git.ICreateCommitParams): Promise<git.ICommit>;
    protected abstract getRefsCore(): Promise<git.IRef[]>;
    protected abstract getRefCore(ref: string, externalWriterConfig?: IExternalWriterConfig): Promise<git.IRef>;
    protected abstract createRefCore(createRefParams: git.ICreateRefParams, externalWriterConfig?: IExternalWriterConfig): Promise<git.IRef>;
    protected abstract patchRefCore(refId: string, patchRefParams: git.IPatchRefParams, externalWriterConfig?: IExternalWriterConfig): Promise<git.IRef>;
    protected abstract deleteRefCore(refId: string): Promise<void>;
    protected abstract getTagCore(tagId: string): Promise<git.ITag>;
    protected abstract createTagCore(tagParams: git.ICreateTagParams): Promise<git.ITag>;

    public get path(): string {
        return this.directory;
    }

    public async getCommit(sha: string): Promise<git.ICommit> {
        return this.enableRepositoryManagerMetrics ?
            this.executeApiWithMetric(
                this.getCommitCore.bind(this),
                [sha],
                GitRestLumberEventName.GetCommit,
                { [BaseGitRestTelemetryProperties.sha]: sha })
            : this.getCommitCore(sha);
    }

    public async getCommits(
        sha: string,
        count: number,
        externalWriterConfig?: IExternalWriterConfig,
    ): Promise<git.ICommitDetails[]> {
        return this.enableRepositoryManagerMetrics ?
            this.executeApiWithMetric(
                this.getCommitsCore.bind(this),
                [sha, count, externalWriterConfig],
                GitRestLumberEventName.GetCommits,
                {
                    [BaseGitRestTelemetryProperties.sha]: sha,
                    count,
                })
            : this.getCommitsCore(sha, count, externalWriterConfig);
    }

    public async getTree(rootSha: string, recursive: boolean): Promise<git.ITree> {
        return this.enableRepositoryManagerMetrics ?
            this.executeApiWithMetric(
                this.getTreeCore.bind(this),
                [rootSha, recursive],
                GitRestLumberEventName.GetTree,
                {
                    [BaseGitRestTelemetryProperties.sha]: rootSha,
                    recursive,
                })
            : this.getTreeCore(rootSha, recursive);
    }

    public async getBlob(sha: string): Promise<git.IBlob> {
        return this.enableRepositoryManagerMetrics ?
            this.executeApiWithMetric(
                this.getBlobCore.bind(this),
                [sha],
                GitRestLumberEventName.GetBlob,
                { [BaseGitRestTelemetryProperties.sha]: sha })
            : this.getBlobCore(sha);
    }

    public async getContent(commit: string, contentPath: string): Promise<git.IBlob> {
        return this.enableRepositoryManagerMetrics ?
            this.executeApiWithMetric(
                this.getContentCore.bind(this),
                [commit, contentPath],
                GitRestLumberEventName.GetContent)
            : this.getContentCore(commit, contentPath);
    }

    public async getRef(refId: string, externalWriterConfig?: IExternalWriterConfig): Promise<git.IRef> {
        return this.enableRepositoryManagerMetrics ?
            this.executeApiWithMetric(
                this.getRefCore.bind(this),
                [refId, externalWriterConfig],
                GitRestLumberEventName.GetRef,
                { [BaseGitRestTelemetryProperties.ref]: refId })
            : this.getRefCore(refId, externalWriterConfig);
    }

    public async getRefs(): Promise<git.IRef[]> {
        return this.enableRepositoryManagerMetrics ?
            this.executeApiWithMetric(
                this.getRefsCore.bind(this),
                [],
                GitRestLumberEventName.GetRefs)
            : this.getRefsCore();
    }

    public async createBlob(createBlobParams: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {
        return this.enableRepositoryManagerMetrics ?
            this.executeApiWithMetric(
                this.createBlobCore.bind(this),
                [createBlobParams],
                GitRestLumberEventName.CreateBlob)
            : this.createBlobCore(createBlobParams);
    }

    public async createTree(params: git.ICreateTreeParams): Promise<git.ITree> {
        return this.enableRepositoryManagerMetrics ?
            this.executeApiWithMetric(
                this.createTreeCore.bind(this),
                [params],
                GitRestLumberEventName.CreateTree)
            : this.createTreeCore(params);
    }

    public async createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit> {
        return this.enableRepositoryManagerMetrics ?
            this.executeApiWithMetric(
                this.createCommitCore.bind(this),
                [commit],
                GitRestLumberEventName.CreateCommit)
            : this.createCommitCore(commit);
    }

    public async createRef(
        createRefParams: git.ICreateRefParams & { force?: boolean },
        externalWriterConfig?: IExternalWriterConfig,
    ): Promise<git.IRef> {
        return this.enableRepositoryManagerMetrics ?
            this.executeApiWithMetric(
                this.createRefCore.bind(this),
                [createRefParams, externalWriterConfig],
                GitRestLumberEventName.CreateRef)
            : this.createRefCore(createRefParams, externalWriterConfig);
    }

    public async patchRef(
        refId: string,
        patchRefParams: git.IPatchRefParams,
        externalWriterConfig?: IExternalWriterConfig,
    ): Promise<git.IRef> {
        return this.enableRepositoryManagerMetrics ?
            this.executeApiWithMetric(
                this.patchRefCore.bind(this),
                [refId, patchRefParams, externalWriterConfig],
                GitRestLumberEventName.PatchRef,
                { [BaseGitRestTelemetryProperties.ref]: refId })
            : this.patchRefCore(refId, patchRefParams, externalWriterConfig);
    }

    public async deleteRef(refId: string): Promise<void> {
        return this.enableRepositoryManagerMetrics ?
            this.executeApiWithMetric(
                this.deleteRefCore.bind(this),
                [refId],
                GitRestLumberEventName.DeleteRef,
                { [BaseGitRestTelemetryProperties.ref]: refId })
            : this.deleteRefCore(refId);
    }

    public async getTag(tagId: string): Promise<git.ITag> {
        return this.enableRepositoryManagerMetrics ?
            this.executeApiWithMetric(
                this.getTagCore.bind(this),
                [tagId],
                GitRestLumberEventName.GetTag,
                { [BaseGitRestTelemetryProperties.tag]: tagId })
            : this.getTagCore(tagId);
    }

    public async createTag(tagParams: git.ICreateTagParams): Promise<git.ITag> {
        return this.enableRepositoryManagerMetrics ?
            this.executeApiWithMetric(
                this.createTagCore.bind(this),
                [tagParams],
                GitRestLumberEventName.CreateTag)
            : this.createTagCore(tagParams);
    }

    private async executeApiWithMetric<T extends any[], U>(
        api: (...args: T) => Promise<U>,
        apiArgs: T,
        apiName: string,
        additionalProperties?: Record<string, any>,
    ): Promise<U> {
        return executeApiWithMetric(
            async () => api(...apiArgs),
            apiName,
            {
                ...this.lumberjackBaseProperties,
                ...additionalProperties,
            }
        );
    }
}
