/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ITelemetryLoggerExt,
	loggerToMonitoringContext,
	PerformanceEvent,
} from "@fluidframework/telemetry-utils";
import { assert, delay, performance } from "@fluidframework/common-utils";
import { LogLevel } from "@fluidframework/core-interfaces";
import * as api from "@fluidframework/protocol-definitions";
import { promiseRaceWithWinner } from "@fluidframework/driver-base";
import { ISummaryContext, DriverErrorType, FetchSource } from "@fluidframework/driver-definitions";
import { RateLimiter, NonRetryableError } from "@fluidframework/driver-utils";
import {
	IOdspResolvedUrl,
	ISnapshotOptions,
	OdspErrorType,
	InstrumentedStorageTokenFetcher,
	getKeyForCacheEntry,
} from "@fluidframework/odsp-driver-definitions";
import {
	IDocumentStorageGetVersionsResponse,
	HostStoragePolicyInternal,
	IVersionedValueWithEpoch,
	ISnapshotCachedEntry,
} from "./contracts";
import {
	downloadSnapshot,
	evalBlobsAndTrees,
	fetchSnapshot,
	fetchSnapshotWithRedeem,
	SnapshotFormatSupportType,
} from "./fetchSnapshot";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { IOdspCache, IPrefetchSnapshotContents } from "./odspCache";
import { createCacheSnapshotKey, getWithRetryForTokenRefresh } from "./odspUtils";
import { ISnapshotContents } from "./odspPublicUtils";
import { EpochTracker } from "./epochTracker";
import type { OdspSummaryUploadManager } from "./odspSummaryUploadManager";
import { FlushResult } from "./odspDocumentDeltaConnection";
import { pkgVersion as driverVersion } from "./packageVersion";
import { OdspDocumentStorageServiceBase } from "./odspDocumentStorageServiceBase";

export const defaultSummarizerCacheExpiryTimeout: number = 60 * 1000; // 60 seconds.

interface GetVersionsTelemetryProps {
	cacheEntryAge?: number;
	cacheSummarizerExpired?: boolean;
}

export class OdspDocumentStorageService extends OdspDocumentStorageServiceBase {
	private odspSummaryModuleLoaded: boolean = false;
	private summaryModuleP: Promise<OdspSummaryUploadManager> | undefined;
	private odspSummaryUploadManager: OdspSummaryUploadManager | undefined;

	private firstVersionCall = true;
	private _isFirstSnapshotFromNetwork: boolean | undefined;
	private readonly documentId: string;
	private readonly snapshotUrl: string | undefined;
	private readonly attachmentPOSTUrl: string | undefined;
	private readonly attachmentGETUrl: string | undefined;
	// Driver specified limits for snapshot size and time.
	/**
	 * NOTE: While commit cfff6e3 added restrictions to prevent large payloads, snapshot failures will continue to
	 * happen until blob request throttling is implemented. Until then, as a temporary fix we set arbitrarily large
	 * snapshot size and timeout limits so that such failures are unlikely to occur.
	 */
	private readonly maxSnapshotSizeLimit = 500000000; // 500 MB
	private readonly maxSnapshotFetchTimeout = 120000; // 2 min

	// limits the amount of parallel "attachment" blob uploads
	private readonly createBlobRateLimiter = new RateLimiter(1);

	constructor(
		private readonly odspResolvedUrl: IOdspResolvedUrl,
		private readonly getStorageToken: InstrumentedStorageTokenFetcher,
		private readonly logger: ITelemetryLoggerExt,
		private readonly fetchFullSnapshot: boolean,
		private readonly cache: IOdspCache,
		private readonly hostPolicy: HostStoragePolicyInternal,
		private readonly epochTracker: EpochTracker,
		private readonly flushCallback: () => Promise<FlushResult>,
		private readonly relayServiceTenantAndSessionId: () => string | undefined,
		private readonly snapshotFormatFetchType?: SnapshotFormatSupportType,
	) {
		super(loggerToMonitoringContext(logger).config);

		this.documentId = this.odspResolvedUrl.hashedDocumentId;
		this.snapshotUrl = this.odspResolvedUrl.endpoints.snapshotStorageUrl;
		this.attachmentPOSTUrl = this.odspResolvedUrl.endpoints.attachmentPOSTStorageUrl;
		this.attachmentGETUrl = this.odspResolvedUrl.endpoints.attachmentGETStorageUrl;
	}

	public get isFirstSnapshotFromNetwork() {
		return this._isFirstSnapshotFromNetwork;
	}

	public async createBlob(file: ArrayBufferLike): Promise<api.ICreateBlobResponse> {
		this.checkAttachmentPOSTUrl();

		const response = await getWithRetryForTokenRefresh(async (options) => {
			const storageToken = await this.getStorageToken(options, "CreateBlob");
			const { url, headers } = getUrlAndHeadersWithAuth(
				`${this.attachmentPOSTUrl}/content`,
				storageToken,
				!!this.hostPolicy.sessionOptions?.forceAccessTokenViaAuthorizationHeader,
			);
			headers["Content-Type"] = "application/octet-stream";

			return PerformanceEvent.timedExecAsync(
				this.logger,
				{
					eventName: "createBlob",
					size: file.byteLength,
					waitQueueLength: this.createBlobRateLimiter.waitQueueLength,
				},
				async (event) => {
					const res = await this.createBlobRateLimiter.schedule(async () =>
						this.epochTracker.fetchAndParseAsJSON<api.ICreateBlobResponse>(
							url,
							{
								body: file,
								headers,
								method: "POST",
							},
							"createBlob",
						),
					);
					event.end({
						blobId: res.content.id,
						...res.propsToLog,
					});
					return res;
				},
			);
		});

		return response.content;
	}

	protected async fetchBlobFromStorage(blobId: string, evicted: boolean): Promise<ArrayBuffer> {
		this.checkAttachmentGETUrl();

		const blob = await getWithRetryForTokenRefresh(async (options) => {
			const storageToken = await this.getStorageToken(options, "GetBlob");
			const unAuthedUrl = `${this.attachmentGETUrl}/${encodeURIComponent(blobId)}/content`;
			const { url, headers } = getUrlAndHeadersWithAuth(
				unAuthedUrl,
				storageToken,
				!!this.hostPolicy.sessionOptions?.forceAccessTokenViaAuthorizationHeader,
			);

			return PerformanceEvent.timedExecAsync(
				this.logger,
				{
					eventName: "readDataBlob",
					blobId,
					evicted,
					headers: Object.keys(headers).length !== 0 ? true : undefined,
					waitQueueLength: this.epochTracker.rateLimiter.waitQueueLength,
				},
				async (event) => {
					const res = await this.epochTracker.fetchArray(url, { headers }, "blob");
					event.end({
						waitQueueLength: this.epochTracker.rateLimiter.waitQueueLength,
						...res.propsToLog,
						attempts: options.refresh ? 2 : 1,
					});
					const cacheControl = res.headers.get("cache-control");
					if (
						cacheControl === undefined ||
						!(cacheControl.includes("private") || cacheControl.includes("public"))
					) {
						this.logger.sendErrorEvent({
							eventName: "NonCacheableBlob",
							cacheControl,
							blobId,
							...res.propsToLog,
						});
					}
					return res.content;
				},
			);
		});
		this.blobCache.setBlob(blobId, blob);
		return blob;
	}

	public async getSnapshotTree(
		version?: api.IVersion,
		scenarioName?: string,
		// eslint-disable-next-line @rushstack/no-new-null
	): Promise<api.ISnapshotTree | null> {
		if (!this.snapshotUrl) {
			return null;
		}
		return super.getSnapshotTree(version, scenarioName);
	}

	public async getVersions(
		// eslint-disable-next-line @rushstack/no-new-null
		blobid: string | null,
		count: number,
		scenarioName?: string,
		fetchSource?: FetchSource,
	): Promise<api.IVersion[]> {
		// Regular load workflow uses blobId === documentID to indicate "latest".
		if (blobid !== this.documentId && blobid) {
			// FluidFetch & FluidDebugger tools use empty sting to query for versions
			// In such case we need to make a call against SPO to give full picture to the tool.
			// Otherwise, each commit calls getVersions but odsp doesn't have a history for each commit
			// return the blobid as is
			return [
				{
					id: blobid,
					treeId: undefined!,
				},
			];
		}

		// Can't really make a call if we do not have URL
		if (!this.snapshotUrl) {
			return [];
		}

		// If count is one, we can use the trees/latest API, which returns the latest version and trees in a single request for better performance
		if (count === 1 && (blobid === null || blobid === this.documentId)) {
			const hostSnapshotOptions = this.hostPolicy.snapshotOptions;
			const odspSnapshotCacheValue: ISnapshotContents = await PerformanceEvent.timedExecAsync(
				this.logger,
				{ eventName: "ObtainSnapshot", fetchSource },
				async (event: PerformanceEvent) => {
					const props: GetVersionsTelemetryProps = {};
					let cacheLookupTimeInSerialFetch = 0;
					let retrievedSnapshot:
						| ISnapshotContents
						| IPrefetchSnapshotContents
						| undefined;

					let method: string;
					let prefetchWaitStartTime: number = performance.now();
					if (fetchSource === FetchSource.noCache) {
						retrievedSnapshot = await this.fetchSnapshot(
							hostSnapshotOptions,
							scenarioName,
						);
						method = "networkOnly";
					} else {
						// Here's the logic to grab the persistent cache snapshot implemented by the host
						// Epoch tracker is responsible for communicating with the persistent cache, handling epochs and cache versions
						const cachedSnapshotP: Promise<ISnapshotContents | undefined> =
							this.epochTracker
								.get(createCacheSnapshotKey(this.odspResolvedUrl))
								.then(async (snapshotCachedEntry: ISnapshotCachedEntry) => {
									if (snapshotCachedEntry !== undefined) {
										// If the cached entry does not contain the entry time, then assign it a default of 30 days old.
										const age =
											Date.now() -
											(snapshotCachedEntry.cacheEntryTime ??
												Date.now() - 30 * 24 * 60 * 60 * 1000);

										// In order to decrease the number of times we have to execute a snapshot refresh,
										// if this is the summarizer and we have a cache entry but it is past the defaultSummarizerCacheExpiryTimeout,
										// force the network retrieval instead as there might be a more recent snapshot available.
										// See: https://github.com/microsoft/FluidFramework/issues/8995 for additional information.
										if (this.hostPolicy.summarizerClient) {
											if (age > defaultSummarizerCacheExpiryTimeout) {
												props.cacheSummarizerExpired = true;
												return undefined;
											} else {
												props.cacheSummarizerExpired = false;
											}
										}

										// Record the cache age
										props.cacheEntryAge = age;
									}

									return snapshotCachedEntry;
								});
						// Based on the concurrentSnapshotFetch policy:
						// Either retrieve both the network and cache snapshots concurrently and pick the first to return,
						// or grab the cache value and then the network value if the cache value returns undefined.
						// For summarizer which could call this during refreshing of summary parent, always use the cache
						// first. Also for other clients, if it is not critical path which is determined by firstVersionCall,
						// then also check the cache first.
						if (
							this.firstVersionCall &&
							this.hostPolicy.concurrentSnapshotFetch &&
							!this.hostPolicy.summarizerClient
						) {
							const networkSnapshotP = this.fetchSnapshot(
								hostSnapshotOptions,
								scenarioName,
							);

							// Ensure that failures on both paths are ignored initially.
							// I.e. if cache fails for some reason, we will proceed with network result.
							// And vice versa - if (for example) client is offline and network request fails first, we
							// do want to attempt to succeed with cached data!
							const promiseRaceWinner = await promiseRaceWithWinner([
								cachedSnapshotP.catch(() => undefined),
								networkSnapshotP.catch(() => undefined),
							]);
							retrievedSnapshot = promiseRaceWinner.value;
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
						} else {
							// Note: There's a race condition here - another caller may come past the undefined check
							// while the first caller is awaiting later async code in this block.
							const startTime = performance.now();
							retrievedSnapshot = await cachedSnapshotP;
							cacheLookupTimeInSerialFetch = performance.now() - startTime;
							method = retrievedSnapshot !== undefined ? "cache" : "network";

							if (retrievedSnapshot === undefined) {
								prefetchWaitStartTime = performance.now();
								retrievedSnapshot = await this.fetchSnapshot(
									hostSnapshotOptions,
									scenarioName,
								);
							}
						}
					}
					if (method === "network") {
						props.cacheEntryAge = undefined;
					}
					if (this.firstVersionCall) {
						this._isFirstSnapshotFromNetwork = method === "cache" ? false : true;
					}
					const prefetchStartTime: number | undefined = (
						retrievedSnapshot as IPrefetchSnapshotContents
					).prefetchStartTime;
					event.end({
						...props,
						method,
						avoidPrefetchSnapshotCache: this.hostPolicy.avoidPrefetchSnapshotCache,
						...evalBlobsAndTrees(retrievedSnapshot),
						cacheLookupTimeInSerialFetch,
						prefetchSavedDuration:
							prefetchStartTime !== undefined && method !== "cache"
								? prefetchWaitStartTime - prefetchStartTime
								: undefined,
					});
					return retrievedSnapshot;
				},
			);

			const stTime = performance.now();
			// Don't override ops which were fetched during initial load, since we could still need them.
			const id = this.initializeFromSnapshot(odspSnapshotCacheValue, this.firstVersionCall);
			this.logger.sendTelemetryEvent(
				{
					eventName: "SnapshotInitializeTime",
					duration: performance.now() - stTime,
				},
				undefined,
				LogLevel.verbose,
			);
			this.firstVersionCall = false;

			return id ? [{ id, treeId: undefined! }] : [];
		}

		return getWithRetryForTokenRefresh(async (options) => {
			const storageToken = await this.getStorageToken(options, "GetVersions");
			const { url, headers } = getUrlAndHeadersWithAuth(
				`${this.snapshotUrl}/versions?top=${count}`,
				storageToken,
				!!this.hostPolicy.sessionOptions?.forceAccessTokenViaAuthorizationHeader,
			);

			// Fetch the latest snapshot versions for the document
			const response = await PerformanceEvent.timedExecAsync(
				this.logger,
				{
					eventName: "getVersions",
					headers: Object.keys(headers).length !== 0 ? true : undefined,
				},
				async () =>
					this.epochTracker.fetchAndParseAsJSON<IDocumentStorageGetVersionsResponse>(
						url,
						{ headers },
						"versions",
						undefined,
						scenarioName,
					),
			);
			const versionsResponse = response.content;
			if (!versionsResponse) {
				throw new NonRetryableError(
					"No response from /versions endpoint",
					DriverErrorType.genericNetworkError,
					{ driverVersion },
				);
			}
			if (!Array.isArray(versionsResponse.value)) {
				throw new NonRetryableError(
					"Incorrect response from /versions endpoint, expected an array",
					DriverErrorType.genericNetworkError,
					{ driverVersion },
				);
			}
			return versionsResponse.value.map((version) => {
				return {
					id: version.id,
					treeId: undefined!,
				};
			});
		});
	}

	private async fetchSnapshot(
		hostSnapshotOptions: ISnapshotOptions | undefined,
		scenarioName?: string,
	) {
		return this.fetchSnapshotCore(hostSnapshotOptions, scenarioName).catch((error) => {
			// Issue #5895:
			// If we are offline, this error is retryable. But that means that RetriableDocumentStorageService
			// will run in circles calling getSnapshotTree, which would result in OdspDocumentStorageService class
			// going getVersions / individual blob download path. This path is very slow, and will not work with
			// delay-loaded data stores and ODSP storage deleting old snapshots and blobs.
			if (typeof error === "object" && error !== null) {
				error.canRetry = false;
			}
			throw error;
		});
	}

	private async fetchSnapshotCore(
		hostSnapshotOptions: ISnapshotOptions | undefined,
		scenarioName?: string,
	): Promise<ISnapshotContents | IPrefetchSnapshotContents> {
		// Don't look into cache, if the host specifically tells us so.
		if (!this.hostPolicy.avoidPrefetchSnapshotCache) {
			const prefetchCacheKey = getKeyForCacheEntry(
				createCacheSnapshotKey(this.odspResolvedUrl),
			);
			const result = await this.cache.snapshotPrefetchResultCache
				?.get(prefetchCacheKey)
				?.then(async (response) => {
					// Remove it from cache once used.
					this.cache.snapshotPrefetchResultCache.remove(prefetchCacheKey);
					// Validate the epoch from the prefetched snapshot result.
					await this.epochTracker.validateEpoch(response.fluidEpoch, "treesLatest");
					return response;
				})
				.catch(async (err) => {
					this.logger.sendTelemetryEvent(
						{
							eventName: "PrefetchSnapshotError",
							concurrentSnapshotFetch: this.hostPolicy.concurrentSnapshotFetch,
						},
						err,
					);
					return undefined;
				});
			// If the prefetch call, is successful, then return the contents otherwise as backup for now, just
			// proceed with the old snapshot fetch flow.
			if (result !== undefined) {
				return result;
			}
		}
		const snapshotOptions: ISnapshotOptions = {
			mds: this.maxSnapshotSizeLimit,
			...hostSnapshotOptions,
			timeout: hostSnapshotOptions?.timeout
				? Math.min(hostSnapshotOptions.timeout, this.maxSnapshotFetchTimeout)
				: this.maxSnapshotFetchTimeout,
		};

		// No limit on size of snapshot or time to fetch, as otherwise we fail all clients to summarize
		if (this.hostPolicy.summarizerClient) {
			snapshotOptions.mds = undefined;
			snapshotOptions.timeout = undefined;
		}

		const snapshotDownloader = async (
			finalOdspResolvedUrl: IOdspResolvedUrl,
			storageToken: string,
			options: ISnapshotOptions | undefined,
			controller?: AbortController,
		) => {
			return downloadSnapshot(
				finalOdspResolvedUrl,
				storageToken,
				this.logger,
				options,
				this.snapshotFormatFetchType,
				controller,
				this.epochTracker,
				scenarioName,
			);
		};
		const putInCache = async (valueWithEpoch: IVersionedValueWithEpoch) => {
			return this.cache.persistedCache.put(
				createCacheSnapshotKey(this.odspResolvedUrl),
				// Epoch tracker will add the epoch and version to the value here. So just send value to cache.
				valueWithEpoch.value,
			);
		};
		const removeEntries = async () => this.cache.persistedCache.removeEntries();
		try {
			const odspSnapshot = await fetchSnapshotWithRedeem(
				this.odspResolvedUrl,
				this.getStorageToken,
				snapshotOptions,
				!!this.hostPolicy.sessionOptions?.forceAccessTokenViaAuthorizationHeader,
				this.logger,
				snapshotDownloader,
				putInCache,
				removeEntries,
				this.hostPolicy.enableRedeemFallback,
			);
			return odspSnapshot;
		} catch (error: any) {
			const errorType = error.errorType;
			// If the snapshot size is too big and the host specified the size limitation(specified in hostSnapshotOptions), then don't try to fetch the snapshot again.
			if (
				errorType === OdspErrorType.snapshotTooBig &&
				hostSnapshotOptions?.mds !== undefined &&
				this.hostPolicy.summarizerClient !== true
			) {
				throw error;
			}
			// If the first snapshot request was with blobs and we either timed out or the size was too big, then try to fetch without blobs.
			if (
				(errorType === OdspErrorType.snapshotTooBig ||
					errorType === OdspErrorType.fetchTimeout) &&
				snapshotOptions.blobs
			) {
				this.logger.sendErrorEvent({
					eventName: "TreeLatest_SecondCall",
					errorType,
				});
				const snapshotOptionsWithoutBlobs: ISnapshotOptions = {
					...snapshotOptions,
					blobs: 0,
					mds: undefined,
					timeout: undefined,
				};
				const odspSnapshot = await fetchSnapshotWithRedeem(
					this.odspResolvedUrl,
					this.getStorageToken,
					snapshotOptionsWithoutBlobs,
					!!this.hostPolicy.sessionOptions?.forceAccessTokenViaAuthorizationHeader,
					this.logger,
					snapshotDownloader,
					putInCache,
					removeEntries,
					this.hostPolicy.enableRedeemFallback,
				);
				return odspSnapshot;
			}
			throw error;
		}
	}

	public async uploadSummaryWithContext(
		summary: api.ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		this.checkSnapshotUrl();

		// Set the module promise right away, so as to not call it twice.
		if (this.summaryModuleP === undefined) {
			this.summaryModuleP = this.getDelayLoadedSummaryManager();
		}

		// Enable flushing only if we have single commit summary and this is not the initial summary for an empty file
		if (".protocol" in summary.tree && context.ackHandle !== undefined) {
			let retry = 1;
			for (;;) {
				const result = await this.flushCallback();
				const seq = result.lastPersistedSequenceNumber;
				if (seq !== undefined && seq >= context.referenceSequenceNumber) {
					break;
				}

				if (retry > 3) {
					this.logger.sendErrorEvent({
						eventName: "FlushFailure",
						...result,
						retry,
						referenceSequenceNumber: context.referenceSequenceNumber,
					});
					break;
				}

				this.logger.sendPerformanceEvent({
					eventName: "FlushExtraCall",
					...result,
					retry,
					referenceSequenceNumber: context.referenceSequenceNumber,
				});

				retry++;
				await delay(1000 * (result.retryAfter ?? 1));
			}
		}

		if (!this.odspSummaryUploadManager) {
			this.odspSummaryUploadManager = await this.summaryModuleP
				.then(async (m) => {
					this.odspSummaryModuleLoaded = true;
					return m;
				})
				.catch((error) => {
					this.odspSummaryModuleLoaded = false;
					throw error;
				});
		}

		assert(
			this.odspSummaryUploadManager !== undefined,
			0x56e /* summary upload manager should have been initialized */,
		);
		const id = await this.odspSummaryUploadManager.writeSummaryTree(summary, context);
		return id;
	}

	private async getDelayLoadedSummaryManager() {
		assert(this.odspSummaryModuleLoaded === false, 0x56f /* Should be loaded only once */);
		const module = await import(
			/* webpackChunkName: "summaryModule" */ "./odspSummaryUploadManager"
		)
			.then((m) => {
				this.logger.sendTelemetryEvent({ eventName: "SummaryModuleLoaded" });
				return m;
			})
			.catch((error) => {
				this.logger.sendErrorEvent({ eventName: "SummaryModuleLoadFailed" }, error);
				throw error;
			});
		this.odspSummaryUploadManager = new module.OdspSummaryUploadManager(
			this.odspResolvedUrl.endpoints.snapshotStorageUrl,
			this.getStorageToken,
			this.logger,
			this.epochTracker,
			!!this.hostPolicy.sessionOptions?.forceAccessTokenViaAuthorizationHeader,
			this.relayServiceTenantAndSessionId,
		);
		return this.odspSummaryUploadManager;
	}

	private checkSnapshotUrl() {
		if (!this.snapshotUrl) {
			throw new NonRetryableError(
				"Method failed because no snapshot url was available",
				DriverErrorType.genericError,
				{ driverVersion },
			);
		}
	}

	private checkAttachmentPOSTUrl() {
		if (!this.attachmentPOSTUrl) {
			throw new NonRetryableError(
				"Method failed because no attachment POST url was available",
				DriverErrorType.genericError,
				{ driverVersion },
			);
		}
	}

	private checkAttachmentGETUrl() {
		if (!this.attachmentGETUrl) {
			throw new NonRetryableError(
				"Method failed because no attachment GET url was available",
				DriverErrorType.genericError,
				{ driverVersion },
			);
		}
	}

	protected async fetchTreeFromSnapshot(
		id: string,
		scenarioName?: string,
	): Promise<api.ISnapshotTree | undefined> {
		return getWithRetryForTokenRefresh(async (options) => {
			const storageToken = await this.getStorageToken(options, "ReadCommit");
			const snapshotDownloader = async (
				url: string,
				fetchOptions: { [index: string]: any },
			) => {
				return this.epochTracker.fetchAndParseAsJSON(
					url,
					fetchOptions,
					"snapshotTree",
					undefined,
					scenarioName,
				);
			};
			const snapshot = await fetchSnapshot(
				this.snapshotUrl!,
				storageToken,
				id,
				this.fetchFullSnapshot,
				!!this.hostPolicy.sessionOptions?.forceAccessTokenViaAuthorizationHeader,
				this.logger,
				snapshotDownloader,
			);
			let treeId = "";
			if (snapshot.snapshotTree) {
				assert(
					snapshot.snapshotTree.id !== undefined,
					0x222 /* "Root tree should contain the id!!" */,
				);
				treeId = snapshot.snapshotTree.id;
				this.setRootTree(treeId, snapshot.snapshotTree);
			}
			if (snapshot.blobs) {
				this.initBlobsCache(snapshot.blobs);
			}
			// If the version id doesn't match with the id of the tree, then use the id of first tree which in that case
			// will be the actual id of tree to be fetched.
			return this.commitCache.get(id) ?? this.commitCache.get(treeId);
		});
	}
}
