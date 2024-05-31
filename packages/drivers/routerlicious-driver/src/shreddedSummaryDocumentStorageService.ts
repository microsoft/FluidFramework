/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Uint8ArrayToString, stringToBuffer } from "@fluid-internal/client-utils";
import { ISummaryHandle, ISummaryTree } from "@fluidframework/driver-definitions";
import {
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
	ISummaryContext,
	ICreateBlobResponse,
	ISnapshotTreeEx,
	IVersion,
} from "@fluidframework/driver-definitions/internal";
import { buildGitTreeHierarchy } from "@fluidframework/protocol-base";
import {
	ITelemetryLoggerExt,
	MonitoringContext,
	PerformanceEvent,
	createChildMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";

import { ICache, InMemoryCache } from "./cache.js";
import { ISnapshotTreeVersion } from "./definitions.js";
import { GitManager } from "./gitManager.js";
import { IRouterliciousDriverPolicies } from "./policies.js";
import { RetriableGitManager } from "./retriableGitManager.js";
import { ISummaryUploadManager } from "./storageContracts.js";
import { SummaryTreeUploadManager } from "./summaryTreeUploadManager.js";

const isNode = typeof window === "undefined";

/**
 * Document access to underlying storage for routerlicious driver.
 * Uploads summaries piece-by-piece traversing the tree recursively.
 * Downloads summaries piece-by-piece on-demand, or up-front when prefetch is enabled.
 */
export class ShreddedSummaryDocumentStorageService implements IDocumentStorageService {
	private readonly mc: MonitoringContext;
	// The values of this cache is useless. We only need the keys. So we are always putting
	// empty strings as values.
	protected readonly blobsShaCache = new Map<string, string>();
	private readonly blobCache: ICache<ArrayBufferLike> | undefined;
	private readonly snapshotTreeCache: ICache<ISnapshotTreeVersion> | undefined;

	private async getSummaryUploadManager(): Promise<ISummaryUploadManager> {
		const manager = await this.getStorageManager();
		return new SummaryTreeUploadManager(
			new RetriableGitManager(manager, this.logger),
			this.blobsShaCache,
			this.getPreviousFullSnapshot.bind(this),
		);
	}

	constructor(
		protected readonly id: string,
		protected readonly manager: GitManager,
		protected readonly logger: ITelemetryLoggerExt,
		public readonly policies: IDocumentStorageServicePolicies,
		driverPolicies?: IRouterliciousDriverPolicies,
		blobCache?: ICache<ArrayBufferLike>,
		snapshotTreeCache?: ICache<ISnapshotTreeVersion>,
		private readonly getStorageManager: (
			disableCache?: boolean,
		) => Promise<GitManager> = async () => this.manager,
	) {
		if (driverPolicies?.enableRestLess === true || isNode) {
			this.blobCache = blobCache ?? new InMemoryCache();
			this.snapshotTreeCache = snapshotTreeCache ?? new InMemoryCache();
		}

		this.mc = createChildMonitoringContext({
			logger,
		});
	}

	public async getVersions(versionId: string | null, count: number): Promise<IVersion[]> {
		const id = versionId ? versionId : this.id;
		const commits = await PerformanceEvent.timedExecAsync(
			this.logger,
			{
				eventName: "getVersions",
				versionId: id,
				count,
			},
			async () => {
				const manager = await this.getStorageManager();
				return (await manager.getCommits(id, count)).content;
			},
		);
		return commits.map((commit) => ({
			date: commit.commit.author.date,
			id: commit.sha,
			treeId: commit.commit.tree.sha,
		}));
	}

	public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTreeEx | null> {
		let requestVersion = version;
		if (!requestVersion) {
			const versions = await this.getVersions(this.id, 1);
			if (versions.length === 0) {
				return null;
			}

			requestVersion = versions[0];
		}

		const cachedSnapshotTree = await this.snapshotTreeCache?.get(
			this.getCacheKey(requestVersion.treeId),
		);
		if (cachedSnapshotTree) {
			return cachedSnapshotTree.snapshotTree as ISnapshotTreeEx;
		}

		const rawTree = await PerformanceEvent.timedExecAsync(
			this.logger,
			{
				eventName: "getSnapshotTree",
				treeId: requestVersion.treeId,
			},
			async (event) => {
				const manager = await this.getStorageManager();
				const response = (await manager.getTree(requestVersion.treeId)).content;
				event.end({
					size: response.tree.length,
				});
				return response;
			},
		);
		const tree = buildGitTreeHierarchy(rawTree, this.blobsShaCache, true);
		await this.snapshotTreeCache?.put(this.getCacheKey(tree.id), {
			id: requestVersion.id,
			snapshotTree: tree,
		});
		return tree;
	}

	public async readBlob(blobId: string): Promise<ArrayBufferLike> {
		const cachedBlob = await this.blobCache?.get(this.getCacheKey(blobId));
		if (cachedBlob) {
			return cachedBlob;
		}

		const value = await PerformanceEvent.timedExecAsync(
			this.logger,
			{
				eventName: "readBlob",
				blobId,
			},
			async (event) => {
				const manager = await this.getStorageManager();
				const response = (await manager.getBlob(blobId)).content;
				event.end({
					size: response.size,
				});
				return response;
			},
			undefined, // workers
			this.mc.config.getNumber("Fluid.Driver.ReadBlobTelemetrySampling"),
		);
		this.blobsShaCache.set(value.sha, "");
		const bufferContent = stringToBuffer(value.content, value.encoding);
		await this.blobCache?.put(this.getCacheKey(value.sha), bufferContent);
		return bufferContent;
	}

	public async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		const summaryHandle = await PerformanceEvent.timedExecAsync(
			this.logger,
			{
				eventName: "uploadSummaryWithContext",
				proposalHandle: context.proposalHandle,
				ackHandle: context.ackHandle,
				referenceSequenceNumber: context.referenceSequenceNumber,
			},
			async () => {
				const summaryUploadManager = await this.getSummaryUploadManager();
				return summaryUploadManager.writeSummaryTree(
					summary,
					context.ackHandle ?? "",
					"channel",
				);
			},
		);
		return summaryHandle;
	}

	public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
		throw new Error("NOT IMPLEMENTED!");
	}

	public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		const uint8ArrayFile = new Uint8Array(file);
		return PerformanceEvent.timedExecAsync(
			this.logger,
			{
				eventName: "createBlob",
				size: uint8ArrayFile.length,
			},
			async (event) => {
				const manager = await this.getStorageManager();
				const response = await manager
					.createBlob(Uint8ArrayToString(uint8ArrayFile, "base64"), "base64")
					.then((r) => ({ id: r.content.sha, url: r.content.url }));
				event.end({
					blobId: response.id,
				});
				return response;
			},
		);
	}

	private async getPreviousFullSnapshot(
		parentHandle: string,
	): Promise<ISnapshotTreeEx | null | undefined> {
		return parentHandle
			? this.getVersions(parentHandle, 1).then(async (versions) => {
					// Clear the cache as the getSnapshotTree call will fill the cache.
					this.blobsShaCache.clear();
					return this.getSnapshotTree(versions[0]);
			  })
			: undefined;
	}

	private getCacheKey(blobId: string): string {
		return `${this.id}:${blobId}`;
	}
}
