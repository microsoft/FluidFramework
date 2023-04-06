/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as git from "@fluidframework/gitresources";
import { executeApiWithMetric } from "@fluidframework/server-services-utils";
import { IExternalWriterConfig, IRepositoryManager } from "./definitions";
import {
	BaseGitRestTelemetryProperties,
	GitRestLumberEventName,
	GitRestRepositoryApiCategory,
} from "./gitrestTelemetryDefinitions";

export abstract class RepositoryManagerBase implements IRepositoryManager {
	constructor(
		protected readonly directory: string,
		protected readonly lumberjackBaseProperties: Record<string, any>,
		private readonly enableRepositoryManagerMetrics: boolean = false,
		private readonly apiMetricsSamplingPeriod?: number,
	) { }

	protected abstract getCommitCore(sha: string): Promise<git.ICommit>;
	protected abstract getCommitsCore(
		sha: string,
		count: number,
		externalWriterConfig?: IExternalWriterConfig,
	): Promise<git.ICommitDetails[]>;
	protected abstract getTreeCore(root: string, recursive: boolean): Promise<git.ITree>;
	protected abstract getBlobCore(sha: string): Promise<git.IBlob>;
	protected abstract getContentCore(commit: string, path: string): Promise<git.IBlob>;
	protected abstract createBlobCore(
		createBlobParams: git.ICreateBlobParams,
	): Promise<git.ICreateBlobResponse>;
	protected abstract createTreeCore(params: git.ICreateTreeParams): Promise<git.ITree>;
	protected abstract createCommitCore(commit: git.ICreateCommitParams): Promise<git.ICommit>;
	protected abstract getRefsCore(): Promise<git.IRef[]>;
	protected abstract getRefCore(
		ref: string,
		externalWriterConfig?: IExternalWriterConfig,
	): Promise<git.IRef>;
	protected abstract createRefCore(
		createRefParams: git.ICreateRefParams,
		externalWriterConfig?: IExternalWriterConfig,
	): Promise<git.IRef>;
	protected abstract patchRefCore(
		refId: string,
		patchRefParams: git.IPatchRefParams,
		externalWriterConfig?: IExternalWriterConfig,
	): Promise<git.IRef>;
	protected abstract deleteRefCore(refId: string): Promise<void>;
	protected abstract getTagCore(tagId: string): Promise<git.ITag>;
	protected abstract createTagCore(tagParams: git.ICreateTagParams): Promise<git.ITag>;

	public get path(): string {
		return this.directory;
	}

	public async getCommit(sha: string): Promise<git.ICommit> {
		return executeApiWithMetric(
			async () => this.getCommitCore(sha),
			GitRestLumberEventName.RepositoryManager,
			GitRestRepositoryApiCategory.GetCommit,
			this.enableRepositoryManagerMetrics,
			this.apiMetricsSamplingPeriod,
			{
				...this.lumberjackBaseProperties,
				[BaseGitRestTelemetryProperties.sha]: sha,
			},
		);
	}

	public async getCommits(
		sha: string,
		count: number,
		externalWriterConfig?: IExternalWriterConfig,
	): Promise<git.ICommitDetails[]> {
		return executeApiWithMetric(
			async () => this.getCommitsCore(sha, count, externalWriterConfig),
			GitRestLumberEventName.RepositoryManager,
			GitRestRepositoryApiCategory.GetCommits,
			this.enableRepositoryManagerMetrics,
			this.apiMetricsSamplingPeriod,
			{
				...this.lumberjackBaseProperties,
				[BaseGitRestTelemetryProperties.sha]: sha,
				count,
			},
		);
	}

	public async getTree(rootSha: string, recursive: boolean): Promise<git.ITree> {
		return executeApiWithMetric(
			async () => this.getTreeCore(rootSha, recursive),
			GitRestLumberEventName.RepositoryManager,
			GitRestRepositoryApiCategory.GetTree,
			this.enableRepositoryManagerMetrics,
			this.apiMetricsSamplingPeriod,
			{
				...this.lumberjackBaseProperties,
				[BaseGitRestTelemetryProperties.sha]: rootSha,
				recursive,
			},
		);
	}

	public async getBlob(sha: string): Promise<git.IBlob> {
		return executeApiWithMetric(
			async () => this.getBlobCore(sha),
			GitRestLumberEventName.RepositoryManager,
			GitRestRepositoryApiCategory.GetBlob,
			this.enableRepositoryManagerMetrics,
			this.apiMetricsSamplingPeriod,
			{
				...this.lumberjackBaseProperties,
				[BaseGitRestTelemetryProperties.sha]: sha
			},
		);
	}

	public async getContent(commit: string, contentPath: string): Promise<git.IBlob> {
		return executeApiWithMetric(
			async () => this.getContentCore(commit, contentPath),
			GitRestLumberEventName.RepositoryManager,
			GitRestRepositoryApiCategory.GetContent,
			this.enableRepositoryManagerMetrics,
			this.apiMetricsSamplingPeriod,
			this.lumberjackBaseProperties,
		);
	}

	public async getRef(
		refId: string,
		externalWriterConfig?: IExternalWriterConfig,
	): Promise<git.IRef> {
		return executeApiWithMetric(
			async () => this.getRefCore(refId, externalWriterConfig),
			GitRestLumberEventName.RepositoryManager,
			GitRestRepositoryApiCategory.GetRef,
			this.enableRepositoryManagerMetrics,
			this.apiMetricsSamplingPeriod,
			{
				...this.lumberjackBaseProperties,
				[BaseGitRestTelemetryProperties.ref]: refId,
			},
		);
	}

	public async getRefs(): Promise<git.IRef[]> {
		return executeApiWithMetric(
			async () => this.getRefsCore(),
			GitRestLumberEventName.RepositoryManager,
			GitRestRepositoryApiCategory.GetRefs,
			this.enableRepositoryManagerMetrics,
			this.apiMetricsSamplingPeriod,
			this.lumberjackBaseProperties,
		);
	}

	public async createBlob(
		createBlobParams: git.ICreateBlobParams,
	): Promise<git.ICreateBlobResponse> {
		return executeApiWithMetric(
			async () => this.createBlobCore(createBlobParams),
			GitRestLumberEventName.RepositoryManager,
			GitRestRepositoryApiCategory.CreateBlob,
			this.enableRepositoryManagerMetrics,
			this.apiMetricsSamplingPeriod,
			this.lumberjackBaseProperties,
		);
	}

	public async createTree(params: git.ICreateTreeParams): Promise<git.ITree> {
		return executeApiWithMetric(
			async () => this.createTreeCore(params),
			GitRestLumberEventName.RepositoryManager,
			GitRestRepositoryApiCategory.CreateTree,
			this.enableRepositoryManagerMetrics,
			this.apiMetricsSamplingPeriod,
			this.lumberjackBaseProperties,
		);
	}

	public async createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit> {
		return executeApiWithMetric(
			async () => this.createCommitCore(commit),
			GitRestLumberEventName.RepositoryManager,
			GitRestRepositoryApiCategory.CreateCommit,
			this.enableRepositoryManagerMetrics,
			this.apiMetricsSamplingPeriod,
			this.lumberjackBaseProperties,
		);
	}

	public async createRef(
		createRefParams: git.ICreateRefParams & { force?: boolean },
		externalWriterConfig?: IExternalWriterConfig,
	): Promise<git.IRef> {
		return executeApiWithMetric(
			async () => this.createRefCore(createRefParams, externalWriterConfig),
			GitRestLumberEventName.RepositoryManager,
			GitRestRepositoryApiCategory.CreateRef,
			this.enableRepositoryManagerMetrics,
			this.apiMetricsSamplingPeriod,
			this.lumberjackBaseProperties,
		);
	}

	public async patchRef(
		refId: string,
		patchRefParams: git.IPatchRefParams,
		externalWriterConfig?: IExternalWriterConfig,
	): Promise<git.IRef> {
		return executeApiWithMetric(
			async () => this.patchRefCore(refId, patchRefParams, externalWriterConfig),
			GitRestLumberEventName.RepositoryManager,
			GitRestRepositoryApiCategory.PatchRef,
			this.enableRepositoryManagerMetrics,
			this.apiMetricsSamplingPeriod,
			{
				...this.lumberjackBaseProperties,
				[BaseGitRestTelemetryProperties.ref]: refId,
			},
		);
	}

	public async deleteRef(refId: string): Promise<void> {
		return executeApiWithMetric(
			async () => this.deleteRefCore(refId),
			GitRestLumberEventName.RepositoryManager,
			GitRestRepositoryApiCategory.DeleteRef,
			this.enableRepositoryManagerMetrics,
			this.apiMetricsSamplingPeriod,
			{
				...this.lumberjackBaseProperties,
				[BaseGitRestTelemetryProperties.ref]: refId,
			},
		);
	}

	public async getTag(tagId: string): Promise<git.ITag> {
		return executeApiWithMetric(
			async () => this.getTagCore(tagId),
			GitRestLumberEventName.RepositoryManager,
			GitRestRepositoryApiCategory.GetTag,
			this.enableRepositoryManagerMetrics,
			this.apiMetricsSamplingPeriod,
			{
				...this.lumberjackBaseProperties,
				[BaseGitRestTelemetryProperties.tag]: tagId
			},
		);
	}

	public async createTag(tagParams: git.ICreateTagParams): Promise<git.ITag> {
		return executeApiWithMetric(
			async () => this.createTagCore(tagParams),
			GitRestLumberEventName.RepositoryManager,
			GitRestRepositoryApiCategory.CreateTag,
			this.enableRepositoryManagerMetrics,
			this.apiMetricsSamplingPeriod,
			this.lumberjackBaseProperties,
		);
	}
}
