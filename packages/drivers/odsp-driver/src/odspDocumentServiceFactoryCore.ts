/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { PromiseCache } from "@fluidframework/core-utils/internal";
import type { ISummaryTree } from "@fluidframework/driver-definitions";
import type {
	IDocumentService,
	IDocumentServiceFactory,
	IFileEntry,
	IPersistedCache,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import {
	getDocAttributesFromProtocolSummary,
	isCombinedAppAndProtocolSummary,
} from "@fluidframework/driver-utils/internal";
import {
	type HostStoragePolicy,
	type IOdspResolvedUrl,
	type IOdspUrlParts,
	type IRelaySessionAwareDriverFactory,
	type ISharingLinkKind,
	type ISocketStorageDiscovery,
	type OdspResourceTokenFetchOptions,
	SharingLinkRole,
	SharingLinkScope,
	type TokenFetchOptions,
	type TokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import {
	PerformanceEvent,
	UsageError,
	createChildLogger,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { useCreateNewModule } from "./createFile/index.js";
import {
	type EpochTracker,
	type ICacheAndTracker,
	createOdspCacheAndTracker,
} from "./epochTracker.js";
import {
	type INonPersistentCache,
	type IPrefetchSnapshotContents,
	LocalPersistentCache,
	NonPersistentCache,
} from "./odspCache.js";
import { OdspDocumentService } from "./odspDocumentService.js";
import { OdspDriverUrlResolver } from "./odspDriverUrlResolver.js";
import { odspDriverCompatDetailsForLoader } from "./odspLayerCompatState.js";
import {
	type IExistingFileInfo,
	type INewFileInfo,
	createOdspLogger,
	getJoinSessionCacheKey,
	getOdspResolvedUrl,
	isNewFileInfo,
	toInstrumentedOdspStorageTokenFetcher,
	toInstrumentedOdspTokenFetcher,
} from "./odspUtils.js";
// eslint-disable-next-line import-x/no-internal-modules
import { OdspPointInTimeDocumentService } from "./pointInTimeDriver/odspPointInTimeDocumentService.js";
import {
	createOdspVersionManager,
	type IOdspVersionManager,
} from "./odspVersionManager/index.js";

/**
 * An ODSP document service factory that supports point-in-time (sequence-number-based) loading.
 *
 * @remarks
 * The loader detects this capability structurally, so hosts can pass this factory directly to
 * {@link @fluidframework/container-loader#loadContainerToSequenceNumber}.
 *
 * @legacy @beta
 */
export interface IPointInTimeDocumentServiceFactory extends IDocumentServiceFactory {
	/**
	 * Creates a document service that materializes the document at the requested sequence number.
	 *
	 * @param resolvedUrl - The resolved ODSP document URL.
	 * @param targetSequenceNumber - The sequence number at which to materialize the document.
	 * @param logger - Optional telemetry logger.
	 * @param clientIsSummarizer - Whether to apply summarizer policies and telemetry to the
	 * underlying document services. Defaults to `false`.
	 * @returns A read-only document service materialized at the requested sequence number.
	 */
	createPointInTimeDocumentService(
		resolvedUrl: IResolvedUrl,
		targetSequenceNumber: number,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService>;
}

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 *
 * This constructor should be used by environments that support dynamic imports and that wish
 * to leverage code splitting as a means to keep bundles as small as possible.
 * @legacy
 * @beta
 */
export class OdspDocumentServiceFactoryCore
	implements IDocumentServiceFactory, IRelaySessionAwareDriverFactory
{
	private readonly nonPersistentCache: INonPersistentCache = new NonPersistentCache();
	private readonly socketReferenceKeyPrefix?: string;

	public get snapshotPrefetchResultCache(): PromiseCache<string, IPrefetchSnapshotContents> {
		return this.nonPersistentCache.snapshotPrefetchResultCache;
	}

	// TODO: return `IRelaySessionAwareDriverFactory` instead of `this` (breaking change)
	public get IRelaySessionAwareDriverFactory(): this {
		return this;
	}

	/**
	 * This function would return info about relay service session only if this factory established (or attempted to
	 * establish) connection very recently. Otherwise, it will return undefined.
	 * @param resolvedUrl - resolved url for container
	 * @returns The current join session response stored in cache. `undefined` if not present.
	 */
	public async getRelayServiceSessionInfo(
		resolvedUrl: IResolvedUrl,
	): Promise<ISocketStorageDiscovery | undefined> {
		const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);
		const joinSessionResponse = await this.nonPersistentCache.sessionJoinCache.get(
			getJoinSessionCacheKey(odspResolvedUrl),
		);
		return joinSessionResponse?.joinSessionResponse;
	}

	public async createContainer(
		createNewSummary: ISummaryTree | undefined,
		createNewResolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		const odspResolvedUrl = getOdspResolvedUrl(createNewResolvedUrl);
		const resolvedUrlData: IOdspUrlParts = {
			siteUrl: odspResolvedUrl.siteUrl,
			driveId: odspResolvedUrl.driveId,
			itemId: odspResolvedUrl.itemId,
		};

		let fileInfo: INewFileInfo | IExistingFileInfo;
		let createShareLinkParam: ISharingLinkKind | undefined;
		if (odspResolvedUrl.itemId) {
			fileInfo = {
				type: "Existing",
				driveId: odspResolvedUrl.driveId,
				siteUrl: odspResolvedUrl.siteUrl,
				itemId: odspResolvedUrl.itemId,
			};
		} else if (odspResolvedUrl.fileName) {
			const [, queryString] = odspResolvedUrl.url.split("?");
			const searchParams = new URLSearchParams(queryString);
			const filePath = searchParams.get("path");
			if (filePath === undefined || filePath === null) {
				throw new Error("File path should be provided!!");
			}
			createShareLinkParam = getSharingLinkParams(this.hostPolicy, searchParams);
			fileInfo = {
				type: "New",
				driveId: odspResolvedUrl.driveId,
				siteUrl: odspResolvedUrl.siteUrl,
				filePath,
				filename: odspResolvedUrl.fileName,
				createLinkType: createShareLinkParam,
			};
		} else {
			throw new Error("A new or existing file must be specified to create container!");
		}

		if (isCombinedAppAndProtocolSummary(createNewSummary)) {
			const documentAttributes = getDocAttributesFromProtocolSummary(
				createNewSummary.tree[".protocol"],
			);
			if (documentAttributes?.sequenceNumber !== 0) {
				throw new Error("Seq number in detached ODSP container should be 0");
			}
		}

		const odspLogger = createOdspLogger(logger);

		const fileEntry: IFileEntry = {
			resolvedUrl: odspResolvedUrl,
			docId: odspResolvedUrl.hashedDocumentId,
			fileVersion: undefined,
		};
		const cacheAndTracker = createOdspCacheAndTracker(
			this.persistedCache,
			this.nonPersistentCache,
			fileEntry,
			odspLogger,
			clientIsSummarizer,
		);

		return PerformanceEvent.timedExecAsync(
			odspLogger,
			{
				eventName: "CreateNew",
				isWithSummaryUpload: true,
				createShareLinkParam: createShareLinkParam
					? JSON.stringify(createShareLinkParam)
					: undefined,
				enableSingleRequestForShareLinkWithCreate:
					this.hostPolicy.enableSingleRequestForShareLinkWithCreate,
			},
			async (event) => {
				const getAuthHeader = toInstrumentedOdspStorageTokenFetcher(
					odspLogger,
					resolvedUrlData,
					this.getStorageToken,
				);
				const _odspResolvedUrl = await useCreateNewModule(odspLogger, async (module) => {
					return isNewFileInfo(fileInfo)
						? module.createNewFluidFile(
								getAuthHeader,
								fileInfo,
								odspLogger,
								createNewSummary,
								cacheAndTracker.epochTracker,
								fileEntry,
								this.hostPolicy.cacheCreateNewSummary ?? true,
								!!this.hostPolicy.sessionOptions?.forceAccessTokenViaAuthorizationHeader,
								odspResolvedUrl.isClpCompliantApp,
								this.hostPolicy.enableSingleRequestForShareLinkWithCreate,
								odspResolvedUrl,
							)
						: module.createNewContainerOnExistingFile(
								getAuthHeader,
								fileInfo,
								odspLogger,
								createNewSummary,
								cacheAndTracker.epochTracker,
								fileEntry,
								this.hostPolicy.cacheCreateNewSummary ?? true,
								!!this.hostPolicy.sessionOptions?.forceAccessTokenViaAuthorizationHeader,
								odspResolvedUrl.isClpCompliantApp,
								odspResolvedUrl.fileMetadata?.eTag,
							);
				});
				const docService = this.createDocumentServiceCore(
					_odspResolvedUrl,
					odspLogger,
					cacheAndTracker,
					clientIsSummarizer,
				);
				event.end({
					docId: _odspResolvedUrl.hashedDocumentId,
				});
				return docService;
			},
		);
	}

	/**
	 * @param getStorageToken - function that can provide the storage token for a given site. This is
	 * is also referred to as the "Vroom" token in SPO.
	 * @param getWebsocketToken - function that can provide a token for accessing the web socket. This is also
	 * to as the "Push" token in SPO. If undefined then websocket token is expected to be returned with joinSession
	 * response payload.
	 * @param persistedCache - PersistedCache provided by host for use in this session.
	 * @param hostPolicy - Policy for storage provided by host.
	 */
	constructor(
		private readonly getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
		private readonly getWebsocketToken:
			| TokenFetcher<OdspResourceTokenFetchOptions>
			| undefined,
		protected persistedCache: IPersistedCache = new LocalPersistentCache(),
		private readonly hostPolicy: HostStoragePolicy = {},
	) {
		if (this.hostPolicy.isolateSocketCache === true) {
			// create the key to separate the socket reuse cache
			this.socketReferenceKeyPrefix = uuid();
		}
		// Set enableRedeemFallback by default as true.
		this.hostPolicy.enableRedeemFallback = this.hostPolicy.enableRedeemFallback ?? true;
		this.hostPolicy.sessionOptions = {
			forceAccessTokenViaAuthorizationHeader: true,
			...this.hostPolicy.sessionOptions,
		};
	}

	/**
	 * The compatibility details of the ODSP Driver layer that is exposed to the Loader layer
	 * for validating Loader-Driver compatibility.
	 * @remarks This is for internal use only.
	 * The type of this should be ILayerCompatDetails. However, ILayerCompatDetails is internal and this class
	 * is currently marked as legacy alpha. So, using unknown here.
	 */
	public readonly ILayerCompatDetails?: unknown = odspDriverCompatDetailsForLoader;

	public async createDocumentService(
		resolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		return this.createDocumentServiceCore(
			resolvedUrl,
			createOdspLogger(logger),
			undefined,
			clientIsSummarizer,
		);
	}

	/**
	 * Creates a document service that reads its snapshot from the closest file version at or before
	 * the target and its deltas from the live document, materializing a requested sequence number
	 * through replay.
	 *
	 * @param resolvedUrl - The resolved ODSP document URL.
	 * @param targetSequenceNumber - The sequence number at which to materialize the document.
	 * @param logger - Optional telemetry logger.
	 * @param clientIsSummarizer - Whether to apply summarizer policies and telemetry to the
	 * underlying document services. Defaults to `false`.
	 * @returns A read-only document service materialized at the requested sequence number.
	 */
	public readonly createPointInTimeDocumentService?: IPointInTimeDocumentServiceFactory["createPointInTimeDocumentService"] =
		async (
			resolvedUrl: IResolvedUrl,
			targetSequenceNumber: number,
			logger?: ITelemetryBaseLogger,
			clientIsSummarizer?: boolean,
		): Promise<IDocumentService> => {
			const odspLogger = createOdspLogger(logger);
			const extLogger = createChildLogger({ logger: odspLogger });
			const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);

			// Use one epoch tracker for version selection, the base snapshot, and live ops so a
			// point-in-time load cannot combine data from different file lineages.
			const cacheAndTracker = createOdspCacheAndTracker(
				this.persistedCache,
				new NonPersistentCache(),
				{
					resolvedUrl: odspResolvedUrl,
					docId: odspResolvedUrl.hashedDocumentId,
					fileVersion: odspResolvedUrl.fileVersion,
				},
				extLogger,
				clientIsSummarizer,
			);

			const versionManager = this.createVersionManager(
				odspResolvedUrl,
				extLogger,
				cacheAndTracker.epochTracker,
			);
			const baseResult = await versionManager.findBaseForSeq(targetSequenceNumber);
			if (baseResult.kind === "noBaseVersion") {
				const oldestResolvedSequenceDetail =
					baseResult.oldestResolvedSeq === undefined
						? ""
						: ` The oldest resolved file version is at sequence number ${baseResult.oldestResolvedSeq}.`;
				throw new UsageError(
					`No ODSP file version is available at or before sequence number ${targetSequenceNumber}.${oldestResolvedSequenceDetail}`,
				);
			}

			const recoverableResolvedUrl = await this.resolveFileVersion(
				resolvedUrl,
				baseResult.base.versionId,
			);
			// Keep historical snapshots isolated from the normal factory cache while validating both
			// services against the shared tracker.
			const recoverableDocumentService = await this.createDocumentServiceCore(
				recoverableResolvedUrl,
				odspLogger,
				cacheAndTracker,
				clientIsSummarizer,
			);
			const liveDocumentService = await this.createDocumentServiceCore(
				resolvedUrl,
				odspLogger,
				cacheAndTracker,
				clientIsSummarizer,
			);
			return new OdspPointInTimeDocumentService(
				recoverableResolvedUrl,
				recoverableDocumentService,
				liveDocumentService,
				targetSequenceNumber,
			);
		};

	/**
	 * Creates the version manager used to select the closest file version at or before the target.
	 */
	private createVersionManager(
		odspResolvedUrl: IOdspResolvedUrl,
		logger: TelemetryLoggerExt,
		epochTracker: EpochTracker,
	): IOdspVersionManager {
		const urlParts: IOdspUrlParts = {
			siteUrl: odspResolvedUrl.siteUrl,
			driveId: odspResolvedUrl.driveId,
			itemId: odspResolvedUrl.itemId,
		};
		const getAuthHeader = toInstrumentedOdspStorageTokenFetcher(
			logger,
			urlParts,
			this.getStorageToken,
		);
		return createOdspVersionManager({
			urlParts,
			getAuthHeader,
			epochTracker,
			logger,
		});
	}

	private async resolveFileVersion(
		resolvedUrl: IResolvedUrl,
		fileVersion: string,
	): Promise<IResolvedUrl> {
		const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);
		const query = new URLSearchParams({
			driveId: odspResolvedUrl.driveId,
			itemId: odspResolvedUrl.itemId,
			fileVersion,
		});
		if (odspResolvedUrl.dataStorePath !== undefined) {
			query.set("path", odspResolvedUrl.dataStorePath);
		}
		if (odspResolvedUrl.codeHint?.containerPackageName !== undefined) {
			query.set("containerPackageName", odspResolvedUrl.codeHint.containerPackageName);
		}
		return new OdspDriverUrlResolver().resolve({
			url: `${odspResolvedUrl.siteUrl}?${query.toString()}`,
		});
	}

	protected async createDocumentServiceCore(
		resolvedUrl: IResolvedUrl,
		odspLogger: ITelemetryBaseLogger,
		cacheAndTrackerArg?: ICacheAndTracker,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		const extLogger = createChildLogger({ logger: odspLogger });
		const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);
		const resolvedUrlData: IOdspUrlParts = {
			siteUrl: odspResolvedUrl.siteUrl,
			driveId: odspResolvedUrl.driveId,
			itemId: odspResolvedUrl.itemId,
		};

		const cacheAndTracker =
			cacheAndTrackerArg ??
			createOdspCacheAndTracker(
				this.persistedCache,
				this.nonPersistentCache,
				{
					resolvedUrl: odspResolvedUrl,
					docId: odspResolvedUrl.hashedDocumentId,
					fileVersion: odspResolvedUrl.fileVersion,
				},
				extLogger,
				clientIsSummarizer,
			);

		const storageTokenFetcher = toInstrumentedOdspStorageTokenFetcher(
			extLogger,
			resolvedUrlData,
			this.getStorageToken,
		);

		const webSocketTokenFetcher =
			this.getWebsocketToken === undefined
				? undefined
				: async (options: TokenFetchOptions): Promise<string | null> =>
						// websocket expects a plain token
						toInstrumentedOdspTokenFetcher(
							extLogger,
							resolvedUrlData,
							this.getWebsocketToken!,
							false /* throwOnNullToken */,
							true /* returnPlainToken */,
						)(options, "GetWebsocketToken");

		return OdspDocumentService.create(
			resolvedUrl,
			storageTokenFetcher,
			webSocketTokenFetcher,
			extLogger,
			cacheAndTracker.cache,
			this.hostPolicy,
			cacheAndTracker.epochTracker,
			this.socketReferenceKeyPrefix,
			clientIsSummarizer,
		);
	}
}

/**
 * Extract the sharing link kind from the resolved URL's query paramerters
 */
function getSharingLinkParams(
	hostPolicy: HostStoragePolicy,
	searchParams: URLSearchParams,
): ISharingLinkKind | undefined {
	// extract request parameters for creation of sharing link (if provided) if the feature is enabled
	let createShareLinkParam: ISharingLinkKind | undefined;
	if (hostPolicy.enableSingleRequestForShareLinkWithCreate) {
		const createLinkScope = searchParams.get("createLinkScope");
		const createLinkRole = searchParams.get("createLinkRole");
		if (createLinkScope && SharingLinkScope[createLinkScope]) {
			createShareLinkParam = {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				scope: SharingLinkScope[createLinkScope],
				...(createLinkRole && SharingLinkRole[createLinkRole]
					? // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
						{ role: SharingLinkRole[createLinkRole] }
					: {}),
			};
		}
	}
	return createShareLinkParam;
}
