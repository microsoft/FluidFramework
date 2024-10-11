/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Uint8ArrayToString, performance, stringToBuffer } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import { getW3CData, promiseRaceWithWinner } from "@fluidframework/driver-base/internal";
import { ISummaryHandle, ISummaryTree } from "@fluidframework/driver-definitions";
import {
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
	ISummaryContext,
	ICreateBlobResponse,
	ISnapshotTree,
	IVersion,
} from "@fluidframework/driver-definitions/internal";
import {
	ITelemetryLoggerExt,
	MonitoringContext,
	PerformanceEvent,
	createChildMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";

import { ICache, InMemoryCache } from "./cache.js";
import { INormalizedWholeSnapshot, IWholeFlatSnapshot } from "./contracts.js";
import { GitManager } from "./gitManager.js";
import { IRouterliciousDriverPolicies } from "./policies.js";
import { convertWholeFlatSnapshotToSnapshotTreeAndBlobs } from "./r11sSnapshotParser.js";
import { IR11sResponse } from "./restWrapper.js";
import { ISummaryUploadManager } from "./storageContracts.js";
import {
	convertSnapshotAndBlobsToSummaryTree,
	evalBlobsAndTrees,
	validateBlobsAndTrees,
} from "./treeUtils.js";
import { WholeSummaryUploadManager } from "./wholeSummaryUploadManager.js";

const latestSnapshotId: string = "latest";

export class WholeSummaryDocumentStorageService implements IDocumentStorageService {
	private readonly mc: MonitoringContext;
	private firstVersionsCall: boolean = true;

	private async getSummaryUploadManager(): Promise<ISummaryUploadManager> {
		const manager = await this.getStorageManager();
		return new WholeSummaryUploadManager(manager);
	}

	constructor(
		protected readonly id: string,
		protected readonly manager: GitManager,
		protected readonly logger: ITelemetryLoggerExt,
		public readonly policies: IDocumentStorageServicePolicies,
		private readonly driverPolicies?: IRouterliciousDriverPolicies,
		private readonly blobCache: ICache<ArrayBufferLike> = new InMemoryCache(),
		private readonly snapshotTreeCache: ICache<INormalizedWholeSnapshot> = new InMemoryCache(),
		private readonly noCacheGitManager?: GitManager,
		private readonly getStorageManager: (
			disableCache?: boolean,
		) => Promise<GitManager> = async (disableCache) =>
			disableCache && this.noCacheGitManager !== undefined
				? this.noCacheGitManager
				: this.manager,
	) {
		this.mc = createChildMonitoringContext({
			logger,
		});
	}

	// eslint-disable-next-line @rushstack/no-new-null
	public async getVersions(versionId: string | null, count: number): Promise<IVersion[]> {
		if (versionId !== this.id && versionId !== null) {
			// Blobs/Trees in this scenario will never have multiple versions, so return versionId as is
			return [
				{
					id: versionId,
					treeId: undefined!,
				},
			];
		}
		// If this is the first versions call for the document, we know we will want the latest summary.
		// Fetch latest summary, cache it, and return its id.
		if (this.firstVersionsCall && count === 1) {
			const normalizedSnapshotContents = await PerformanceEvent.timedExecAsync(
				this.logger,
				{
					eventName: "ObtainSnapshot",
					versionId: versionId ?? undefined,
					count,
					enableDiscovery: this.driverPolicies?.enableDiscovery,
				},
				async (event) => {
					let method: string;
					const cachedSnapshotP = this.snapshotTreeCache.get(
						this.getCacheKey(latestSnapshotId),
					);

					const networkSnapshotP = !this.driverPolicies?.enableDiscovery
						? this.fetchSnapshotTree(latestSnapshotId, false, "getVersions")
						: this.fetchSnapshotTree(latestSnapshotId, true, "getVersions");

					const promiseRaceWinner = await promiseRaceWithWinner([
						cachedSnapshotP.catch(() => undefined),
						networkSnapshotP.catch(() => undefined),
					]);

					let retrievedSnapshot = promiseRaceWinner.value;
					method = promiseRaceWinner.index === 0 ? "cache" : "network";

					if (retrievedSnapshot === undefined) {
						// if network failed -> wait for cache ( then return network failure)
						// If cache returned empty or failed -> wait for network (success of failure)
						if (promiseRaceWinner.index === 1) {
							retrievedSnapshot = await cachedSnapshotP;
							method = "cache";
						}
						if (retrievedSnapshot === undefined) {
							retrievedSnapshot = await networkSnapshotP;
							method = "network";
						}
					}
					event.end({
						method,
					});
					return retrievedSnapshot;
				},
			);

			const _id = await this.initializeFromSnapshot(normalizedSnapshotContents);
			this.firstVersionsCall = false;
			return [
				{
					id: _id,
					treeId: normalizedSnapshotContents.snapshotTree.id!,
				},
			];
		}

		// Otherwise, get the latest version of the document as normal.
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

	// eslint-disable-next-line @rushstack/no-new-null
	public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
		let requestVersion = version;
		if (!requestVersion) {
			const versions = await this.getVersions(this.id, 1);
			if (versions.length === 0) {
				return null;
			}

			requestVersion = versions[0];
		}

		let normalizedWholeSnapshot = await this.snapshotTreeCache.get(
			this.getCacheKey(requestVersion.id),
		);
		if (normalizedWholeSnapshot !== undefined) {
			return normalizedWholeSnapshot.snapshotTree;
		}

		normalizedWholeSnapshot = await this.fetchSnapshotTree(
			requestVersion.id,
			undefined,
			"getSnapshotTree",
		);

		// Currently retrieving blobs from network is not supported by AFR for WholeSummaryDocumentStorageService
		// Blobs are expected to be put in the cache
		await this.updateBlobsCache(normalizedWholeSnapshot.blobs);

		return normalizedWholeSnapshot.snapshotTree;
	}

	public async readBlob(blobId: string): Promise<ArrayBufferLike> {
		const cachedBlob = await this.blobCache.get(this.getCacheKey(blobId));
		if (cachedBlob !== undefined) {
			return cachedBlob;
		}

		// Note: AFR does not support readBlobs, but potentially other r11s like servers do
		const blob = await PerformanceEvent.timedExecAsync(
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
		const bufferValue = stringToBuffer(blob.content, blob.encoding);

		await this.blobCache.put(this.getCacheKey(blob.sha), bufferValue);

		return bufferValue;
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

	public async downloadSummary(summaryHandle: ISummaryHandle): Promise<ISummaryTree> {
		const wholeFlatSnapshot = await PerformanceEvent.timedExecAsync(
			this.logger,
			{
				eventName: "getWholeFlatSummary",
				treeId: summaryHandle.handle,
			},
			async (event) => {
				const manager = await this.getStorageManager();
				const response = await manager.getSnapshot(summaryHandle.handle);
				event.end({
					size: response.content.trees[0]?.entries.length,
				});
				return response.content;
			},
		);

		const { blobs, snapshotTree } = convertWholeFlatSnapshotToSnapshotTreeAndBlobs(
			wholeFlatSnapshot,
			"",
		);
		return convertSnapshotAndBlobsToSummaryTree(snapshotTree, blobs);
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

	private async fetchSnapshotTree(
		versionId: string,
		disableCache?: boolean,
		scenarioName?: string,
	): Promise<INormalizedWholeSnapshot> {
		const normalizedWholeSummary = await PerformanceEvent.timedExecAsync(
			this.logger,
			{
				eventName: "getWholeFlatSummary",
				treeId: versionId,
				scenarioName,
			},
			async (event) => {
				const manager = await this.getStorageManager(disableCache);
				const response: IR11sResponse<IWholeFlatSnapshot> =
					await manager.getSnapshot(versionId);
				const start = performance.now();
				const snapshot: INormalizedWholeSnapshot =
					convertWholeFlatSnapshotToSnapshotTreeAndBlobs(response.content);
				const snapshotConversionTime = performance.now() - start;
				validateBlobsAndTrees(snapshot.snapshotTree);
				const { trees, numBlobs, encodedBlobsSize } = evalBlobsAndTrees(snapshot);

				event.end({
					size: response.content.trees[0]?.entries.length,
					trees,
					blobs: numBlobs,
					encodedBlobsSize,
					sequenceNumber: snapshot.sequenceNumber,
					...response.propsToLog,
					snapshotConversionTime,
					...getW3CData(response.requestUrl, "xmlhttprequest"),
				});
				return snapshot;
			},
		);

		// Also add the result into the cache.
		await this.snapshotTreeCache
			.put(this.getCacheKey(versionId), normalizedWholeSummary)
			.catch(() => undefined);
		return normalizedWholeSummary;
	}

	private async initializeFromSnapshot(
		normalizedWholeSummary: INormalizedWholeSnapshot,
	): Promise<string> {
		const snapshotId = normalizedWholeSummary.id;
		assert(snapshotId !== undefined, 0x275 /* "Root tree should contain the id" */);
		const cachePs: Promise<any>[] = [
			this.snapshotTreeCache.put(this.getCacheKey(snapshotId), normalizedWholeSummary),
			this.updateBlobsCache(normalizedWholeSummary.blobs),
		];

		await Promise.all(cachePs);

		return snapshotId;
	}

	private async updateBlobsCache(blobs: Map<string, ArrayBuffer>): Promise<void> {
		const blobCachePutPs: Promise<void>[] = [];
		blobs.forEach((value, id) => {
			const cacheKey = this.getCacheKey(id);
			blobCachePutPs.push(this.blobCache.put(cacheKey, value));
		});
		await Promise.all(blobCachePutPs);
	}

	private getCacheKey(blobId: string): string {
		return `${this.id}:${blobId}`;
	}
}
