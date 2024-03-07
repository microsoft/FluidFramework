/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { PromiseCache } from "@fluidframework/core-utils";
import {
	IDocumentService,
	IDocumentServiceFactory,
	IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { PerformanceEvent, createChildLogger } from "@fluidframework/telemetry-utils";
import {
	getDocAttributesFromProtocolSummary,
	isCombinedAppAndProtocolSummary,
} from "@fluidframework/driver-utils";
import {
	TokenFetchOptions,
	OdspResourceTokenFetchOptions,
	TokenFetcher,
	IPersistedCache,
	HostStoragePolicy,
	IFileEntry,
	IOdspUrlParts,
	SharingLinkScope,
	SharingLinkRole,
	ISharingLinkKind,
	ISocketStorageDiscovery,
	IRelaySessionAwareDriverFactory,
} from "@fluidframework/odsp-driver-definitions";
import { v4 as uuid } from "uuid";
import {
	INonPersistentCache,
	IPrefetchSnapshotContents,
	LocalPersistentCache,
	NonPersistentCache,
} from "./odspCache.js";
import { createOdspCacheAndTracker, ICacheAndTracker } from "./epochTracker.js";
import { OdspDocumentService } from "./odspDocumentService.js";
import {
	INewFileInfo,
	getOdspResolvedUrl,
	createOdspLogger,
	toInstrumentedOdspTokenFetcher,
	IExistingFileInfo,
	isNewFileInfo,
	getJoinSessionCacheKey,
} from "./odspUtils.js";

/**
 * Factory for creating the sharepoint document service. Use this if you want to
 * use the sharepoint implementation.
 *
 * This constructor should be used by environments that support dynamic imports and that wish
 * to leverage code splitting as a means to keep bundles as small as possible.
 * @alpha
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
				const getStorageToken = toInstrumentedOdspTokenFetcher(
					odspLogger,
					resolvedUrlData,
					this.getStorageToken,
					true /* throwOnNullToken */,
				);
				// We can delay load this module as this path will not be executed in load flows and create flow
				// while only happens once in lifetime of a document happens in the background after creation of
				// detached container.
				const module = await import(
					/* webpackChunkName: "createNewModule" */ "./createNewModule.js"
				)
					.then((m) => {
						odspLogger.sendTelemetryEvent({ eventName: "createNewModuleLoaded" });
						return m;
					})
					.catch((error) => {
						odspLogger.sendErrorEvent(
							{ eventName: "createNewModuleLoadFailed" },
							error,
						);
						throw error;
					});
				const _odspResolvedUrl = isNewFileInfo(fileInfo)
					? await module.createNewFluidFile(
							getStorageToken,
							fileInfo,
							odspLogger,
							createNewSummary,
							cacheAndTracker.epochTracker,
							fileEntry,
							this.hostPolicy.cacheCreateNewSummary ?? true,
							!!this.hostPolicy.sessionOptions
								?.forceAccessTokenViaAuthorizationHeader,
							odspResolvedUrl.isClpCompliantApp,
							this.hostPolicy.enableSingleRequestForShareLinkWithCreate,
					  )
					: await module.createNewContainerOnExistingFile(
							getStorageToken,
							fileInfo,
							odspLogger,
							createNewSummary,
							cacheAndTracker.epochTracker,
							fileEntry,
							this.hostPolicy.cacheCreateNewSummary ?? true,
							!!this.hostPolicy.sessionOptions
								?.forceAccessTokenViaAuthorizationHeader,
							odspResolvedUrl.isClpCompliantApp,
					  );
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
		private readonly getWebsocketToken: TokenFetcher<OdspResourceTokenFetchOptions> | undefined,
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
				{ resolvedUrl: odspResolvedUrl, docId: odspResolvedUrl.hashedDocumentId },
				extLogger,
				clientIsSummarizer,
			);

		const storageTokenFetcher = toInstrumentedOdspTokenFetcher(
			extLogger,
			resolvedUrlData,
			this.getStorageToken,
			true /* throwOnNullToken */,
		);

		const webSocketTokenFetcher =
			this.getWebsocketToken === undefined
				? undefined
				: async (options: TokenFetchOptions): Promise<string | null> =>
						toInstrumentedOdspTokenFetcher(
							extLogger,
							resolvedUrlData,
							this.getWebsocketToken!,
							false /* throwOnNullToken */,
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
