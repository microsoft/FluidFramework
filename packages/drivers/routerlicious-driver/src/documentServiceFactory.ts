/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	FiveDaysMs,
	IDocumentService,
	IDocumentServiceFactory,
	IDocumentStorageServicePolicies,
	IResolvedUrl,
	LoaderCachingPolicy,
} from "@fluidframework/driver-definitions/internal";
import {
	RateLimiter,
	getDocAttributesFromProtocolSummary,
	getQuorumValuesFromProtocolSummary,
	isCombinedAppAndProtocolSummary,
} from "@fluidframework/driver-utils/internal";
import {
	ISession,
	convertSummaryTreeToWholeSummaryTree,
} from "@fluidframework/server-services-client";
import { PerformanceEvent, createChildLogger } from "@fluidframework/telemetry-utils/internal";

import { ICache, InMemoryCache, NullCache } from "./cache.js";
import { INormalizedWholeSnapshot } from "./contracts.js";
import { ISnapshotTreeVersion } from "./definitions.js";
import { DocumentService } from "./documentService.js";
import { pkgVersion as driverVersion } from "./packageVersion.js";
import { IRouterliciousDriverPolicies } from "./policies.js";
import {
	RouterliciousOrdererRestWrapper,
	RouterliciousStorageRestWrapper,
	toInstrumentedR11sOrdererTokenFetcher,
	toInstrumentedR11sStorageTokenFetcher,
} from "./restWrapper.js";
import { isRouterliciousResolvedUrl } from "./routerliciousResolvedUrl.js";
import { SessionInfoManager } from "./sessionInfoManager.js";
import { ITokenProvider } from "./tokens.js";
import { replaceDocumentIdInPath } from "./urlUtils.js";

const maximumSnapshotCacheDurationMs: FiveDaysMs = 432_000_000; // 5 days in ms

const defaultRouterliciousDriverPolicies: IRouterliciousDriverPolicies = {
	enablePrefetch: true,
	maxConcurrentStorageRequests: 100,
	maxConcurrentOrdererRequests: 100,
	enableDiscovery: false,
	enableWholeSummaryUpload: false,
	enableRestLess: true,
	enableInternalSummaryCaching: true,
	enableLongPollingDowngrade: true,
};

/**
 * Factory for creating the routerlicious document service. Use this if you want to
 * use the routerlicious implementation.
 * @internal
 */
export class RouterliciousDocumentServiceFactory implements IDocumentServiceFactory {
	private readonly driverPolicies: IRouterliciousDriverPolicies;
	private readonly blobCache: ICache<ArrayBufferLike>;
	private readonly wholeSnapshotTreeCache: ICache<INormalizedWholeSnapshot> = new NullCache();
	private readonly shreddedSummaryTreeCache: ICache<ISnapshotTreeVersion> = new NullCache();
	private readonly sessionInfoManager: SessionInfoManager;

	constructor(
		private readonly tokenProvider: ITokenProvider,
		driverPolicies: Partial<IRouterliciousDriverPolicies> = {},
	) {
		// Use the maximum allowed by the policy (IDocumentStorageServicePolicies.maximumCacheDurationMs set below)
		const snapshotCacheExpiryMs: FiveDaysMs = maximumSnapshotCacheDurationMs;

		this.driverPolicies = {
			...defaultRouterliciousDriverPolicies,
			...driverPolicies,
		};
		this.blobCache = new InMemoryCache<ArrayBufferLike>();
		if (this.driverPolicies.enableInternalSummaryCaching) {
			if (this.driverPolicies.enableWholeSummaryUpload) {
				this.wholeSnapshotTreeCache = new InMemoryCache<INormalizedWholeSnapshot>(
					snapshotCacheExpiryMs,
				);
			} else {
				this.shreddedSummaryTreeCache = new InMemoryCache<ISnapshotTreeVersion>(
					snapshotCacheExpiryMs,
				);
			}
		}
		this.sessionInfoManager = new SessionInfoManager(this.driverPolicies.enableDiscovery);
	}

	/**
	 * {@inheritDoc @fluidframework/driver-definitions#IDocumentServiceFactory.createContainer}
	 *
	 * @throws {@link DocumentPostCreateError}
	 * If an exception is thrown while invoking the provided {@link ITokenProvider.documentPostCreateCallback}.
	 */
	public async createContainer(
		createNewSummary: ISummaryTree | undefined,
		resolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		if (createNewSummary === undefined) {
			throw new Error("Empty file summary creation isn't supported in this driver.");
		}
		assert(!!resolvedUrl.endpoints.ordererUrl, 0x0b2 /* "Missing orderer URL!" */);
		const parsedUrl = new URL(resolvedUrl.url);
		if (!parsedUrl.pathname) {
			throw new Error("Parsed url should contain tenant and doc Id!!");
		}
		const [, tenantId] = parsedUrl.pathname.split("/");

		if (!isCombinedAppAndProtocolSummary(createNewSummary)) {
			throw new Error("Protocol and App Summary required in the full summary");
		}
		const protocolSummary = createNewSummary.tree[".protocol"];
		const appSummary = createNewSummary.tree[".app"];

		const documentAttributes = getDocAttributesFromProtocolSummary(protocolSummary);
		const quorumValues = getQuorumValuesFromProtocolSummary(protocolSummary);

		const logger2 = createChildLogger({ logger, namespace: "RouterliciousDriver" });
		const ordererTokenFetcher = toInstrumentedR11sOrdererTokenFetcher(
			tenantId,
			undefined /* documentId */,
			this.tokenProvider,
			logger2,
		);
		const rateLimiter = new RateLimiter(this.driverPolicies.maxConcurrentOrdererRequests);
		const ordererRestWrapper = RouterliciousOrdererRestWrapper.load(
			ordererTokenFetcher,
			logger2,
			rateLimiter,
			this.driverPolicies.enableRestLess,
			resolvedUrl.endpoints.ordererUrl /* baseUrl */,
		);

		const createAsEphemeral = isRouterliciousResolvedUrl(resolvedUrl)
			? resolvedUrl.createAsEphemeral === true
			: false;

		const res = await PerformanceEvent.timedExecAsync(
			logger2,
			{
				eventName: "CreateNew",
				details: JSON.stringify({
					enableDiscovery: this.driverPolicies.enableDiscovery,
					sequenceNumber: documentAttributes.sequenceNumber,
					isEphemeralContainer: createAsEphemeral,
				}),
			},
			async (event) => {
				// @TODO: Remove returned "string" type when removing back-compat code
				const postRes = (
					await ordererRestWrapper.post<
						{ id: string; token?: string; session?: ISession } | string
					>(`/documents/${tenantId}`, {
						summary: convertSummaryTreeToWholeSummaryTree(undefined, appSummary),
						sequenceNumber: documentAttributes.sequenceNumber,
						values: quorumValues,
						enableDiscovery: this.driverPolicies.enableDiscovery,
						generateToken: this.tokenProvider.documentPostCreateCallback !== undefined,
						isEphemeralContainer: createAsEphemeral,
						enableAnyBinaryBlobOnFirstSummary: true,
					})
				).content;

				event.end({
					docId: typeof postRes === "string" ? postRes : postRes.id,
				});
				return postRes;
			},
		);

		// For supporting backward compatibility, when the request has generateToken === true, it will return
		// an object instead of string
		// @TODO: Remove the logic when no need to support back-compat

		let documentId: string;
		let token: string | undefined;
		let session: ISession | undefined;
		if (typeof res === "string") {
			documentId = res;
		} else {
			documentId = res.id;
			token = res.token;
			session = this.driverPolicies.enableDiscovery ? res.session : undefined;
		}

		// @TODO: Remove token from the condition, checking the documentPostCreateCallback !== undefined
		// is sufficient to determine if the token will be undefined or not.
		try {
			await PerformanceEvent.timedExecAsync(
				logger2,
				{
					eventName: "DocPostCreateCallback",
					docId: documentId,
				},
				async () => {
					if (token && this.tokenProvider.documentPostCreateCallback !== undefined) {
						return this.tokenProvider.documentPostCreateCallback(documentId, token);
					}
				},
			);
		} catch (error: any) {
			throw new DocumentPostCreateError(error);
		}

		parsedUrl.pathname = replaceDocumentIdInPath(parsedUrl.pathname, documentId);
		const deltaStorageUrl = resolvedUrl.endpoints?.deltaStorageUrl;
		if (!deltaStorageUrl) {
			throw new Error(
				`All endpoints urls must be provided. [deltaStorageUrl:${deltaStorageUrl}]`,
			);
		}
		const parsedDeltaStorageUrl = new URL(deltaStorageUrl);
		parsedDeltaStorageUrl.pathname = replaceDocumentIdInPath(
			parsedDeltaStorageUrl.pathname,
			documentId,
		);

		return this.createDocumentService(
			{
				...resolvedUrl,
				url: parsedUrl.toString(),
				id: documentId,
				endpoints: {
					...resolvedUrl.endpoints,
					deltaStorageUrl: parsedDeltaStorageUrl.toString(),
				},
			},
			logger,
			clientIsSummarizer,
			session,
		);
	}

	/**
	 * {@inheritDoc @fluidframework/driver-definitions#IDocumentServiceFactory.createDocumentService}
	 *
	 * @returns Routerlicious document service.
	 */
	public async createDocumentService(
		resolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
		session?: ISession,
	): Promise<IDocumentService> {
		const parsedUrl = new URL(resolvedUrl.url);
		const [, tenantId, documentId] = parsedUrl.pathname.split("/");
		if (!documentId || !tenantId) {
			throw new Error(
				`Couldn't parse documentId and/or tenantId. [documentId:${documentId}][tenantId:${tenantId}]`,
			);
		}
		const logger2 = createChildLogger({
			logger,
			namespace: "RouterliciousDriver",
			properties: {
				all: { driverVersion },
			},
		});

		const ordererTokenFetcher = toInstrumentedR11sOrdererTokenFetcher(
			tenantId,
			documentId,
			this.tokenProvider,
			logger2,
		);
		const storageTokenFetcher = toInstrumentedR11sStorageTokenFetcher(
			tenantId,
			documentId,
			this.tokenProvider,
			logger2,
		);
		const ordererTokenP = ordererTokenFetcher();
		const storageTokenP = storageTokenFetcher();

		const rateLimiter = new RateLimiter(this.driverPolicies.maxConcurrentOrdererRequests);
		const ordererRestWrapper = RouterliciousOrdererRestWrapper.load(
			ordererTokenFetcher,
			logger2,
			rateLimiter,
			this.driverPolicies.enableRestLess,
			undefined /* baseUrl */,
			ordererTokenP,
		);

		const fluidResolvedUrl: IResolvedUrl = await this.sessionInfoManager.initializeSessionInfo(
			{
				session,
				resolvedUrl,
				documentId,
				tenantId,
				ordererRestWrapper,
				logger: logger2,
			},
		);

		const storageUrl = fluidResolvedUrl.endpoints?.storageUrl;
		const ordererUrl = fluidResolvedUrl.endpoints?.ordererUrl;
		const deltaStorageUrl = fluidResolvedUrl.endpoints?.deltaStorageUrl;
		const deltaStreamUrl = fluidResolvedUrl.endpoints.deltaStreamUrl || ordererUrl; // backward compatibility
		if (!ordererUrl || !deltaStorageUrl) {
			throw new Error(
				`All endpoints urls must be provided. [ordererUrl:${ordererUrl}][deltaStorageUrl:${deltaStorageUrl}]`,
			);
		}

		const storageRestWrapper = RouterliciousStorageRestWrapper.load(
			tenantId,
			storageTokenFetcher,
			logger2,
			new RateLimiter(this.driverPolicies.maxConcurrentStorageRequests),
			this.driverPolicies.enableRestLess,
			storageUrl /* baseUrl */,
			storageTokenP,
		);

		const documentStorageServicePolicies: IDocumentStorageServicePolicies = {
			caching: this.driverPolicies.enablePrefetch
				? LoaderCachingPolicy.Prefetch
				: LoaderCachingPolicy.NoCaching,
			maximumCacheDurationMs: maximumSnapshotCacheDurationMs,
		};

		return new DocumentService(
			fluidResolvedUrl,
			ordererUrl,
			deltaStorageUrl,
			deltaStreamUrl,
			storageUrl,
			logger2,
			this.tokenProvider,
			tenantId,
			documentId,
			ordererRestWrapper,
			documentStorageServicePolicies,
			this.driverPolicies,
			this.blobCache,
			this.wholeSnapshotTreeCache,
			this.shreddedSummaryTreeCache,
			async () =>
				this.sessionInfoManager.getSessionInfo({
					resolvedUrl,
					documentId,
					tenantId,
					ordererRestWrapper,
					logger: logger2,
				}),
			storageRestWrapper,
			storageTokenFetcher,
			ordererTokenFetcher,
		);
	}
}

/**
 * Error returned by {@link RouterliciousDocumentServiceFactory.createContainer} when an error is thrown
 * in {@link ITokenProvider.documentPostCreateCallback}.
 * It is the consumer's responsibility to ensure that any state related to container creation is appropriately
 * cleaned up in the event of failure.
 * This includes the document itself, which will have been created by the time this error was thrown.
 *
 * @remarks TODO: examples of suggested actions for recovery.
 * - How would a user delete the created document?
 * - What would a retry pattern look like here?
 * @internal
 */
export class DocumentPostCreateError extends Error {
	public constructor(
		/**
		 * Inner error being wrapped.
		 */
		private readonly innerError: Error,
	) {
		super(innerError.message);
	}

	public readonly name = "DocumentPostCreateError";

	public get stack() {
		return this.innerError.stack;
	}
}

/**
 * Creates factory for creating the routerlicious document service.
 *
 * @legacy
 * @alpha
 */
export function createRouterliciousDocumentServiceFactory(
	tokenProvider: ITokenProvider,
): IDocumentServiceFactory {
	return new RouterliciousDocumentServiceFactory(tokenProvider);
}
