/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type {
	IDocumentService,
	IPersistedCache,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import type {
	HostStoragePolicy,
	IOdspUrlParts,
	OdspResourceTokenFetchOptions,
	TokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import { UsageError, createChildLogger } from "@fluidframework/telemetry-utils/internal";

import { createOdspCacheAndTracker } from "../epochTracker.js";
import { NonPersistentCache } from "../odspCache.js";
import { OdspDocumentServiceFactoryCore } from "../odspDocumentServiceFactoryCore.js";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver.js";
import {
	createOdspLogger,
	getOdspResolvedUrl,
	toInstrumentedOdspStorageTokenFetcher,
} from "../odspUtils.js";
import {
	createOdspVersionManager,
	type IOdspVersionManager,
} from "../odspVersionManager/index.js";

import { OdspPointInTimeDocumentService } from "./odspPointInTimeDocumentService.js";

/**
 * ODSP document service factory that additionally supports point-in-time (sequence-number-based)
 * loading.
 *
 * @remarks
 * This extends {@link OdspDocumentServiceFactoryCore} with the ability to materialize a read-only
 * document service at a requested Fluid sequence number. The loader detects this capability via the
 * presence of {@link OdspPointInTimeDocumentServiceFactory.createPointInTimeDocumentService}, so
 * hosts that want to load a container to a target sequence number must construct this factory
 * (rather than the legacy `OdspDocumentServiceFactory`) and pass it to the loader.
 *
 * @internal
 */
export class OdspPointInTimeDocumentServiceFactory extends OdspDocumentServiceFactoryCore {
	/**
	 * The storage token fetcher, captured here because the base class keeps it private.
	 */
	private readonly getStorageTokenForVersions: TokenFetcher<OdspResourceTokenFetchOptions>;

	constructor(
		getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
		getWebsocketToken: TokenFetcher<OdspResourceTokenFetchOptions> | undefined,
		persistedCache?: IPersistedCache,
		hostPolicy?: HostStoragePolicy,
	) {
		super(getStorageToken, getWebsocketToken, persistedCache, hostPolicy);
		this.getStorageTokenForVersions = getStorageToken;
	}

	/**
	 * Creates a document service that reads its snapshot from the closest file version at or before
	 * the target and its deltas from the live document, materializing a requested sequence number
	 * through replay.
	 */
	public async createPointInTimeDocumentService(
		resolvedUrl: IResolvedUrl,
		targetSequenceNumber: number,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		const versionManager = await this.createVersionManager(
			resolvedUrl,
			logger,
			clientIsSummarizer,
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
		const recoverableDocumentService = await this.createDocumentService(
			recoverableResolvedUrl,
			logger,
			clientIsSummarizer,
		);
		const liveDocumentService = await this.createDocumentService(
			resolvedUrl,
			logger,
			clientIsSummarizer,
		);
		return new OdspPointInTimeDocumentService(
			recoverableResolvedUrl,
			recoverableDocumentService,
			liveDocumentService,
			targetSequenceNumber,
		);
	}

	/**
	 * Builds an IOdspVersionManager for the given file, which enumerates the file's stored
	 * versions and resolves the closest version at or before a target sequence number.
	 *
	 * @remarks
	 * This wires up the plumbing the version manager needs to talk to ODSP: it resolves the URL to
	 * its ODSP parts (site/drive/item), creates a scoped child logger, an epoch tracker (from a fresh
	 * NonPersistentCache, since only the tracker is needed for consistency checks), and an
	 * instrumented storage-token/auth-header fetcher. The resulting manager is used by
	 * {@link OdspPointInTimeDocumentServiceFactory.createPointInTimeDocumentService} to pick the base
	 * snapshot for point-in-time loading.
	 */
	private async createVersionManager(
		resolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IOdspVersionManager> {
		const odspLogger = createOdspLogger(logger);
		const extLogger = createChildLogger({ logger: odspLogger });
		const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);
		const urlParts: IOdspUrlParts = {
			siteUrl: odspResolvedUrl.siteUrl,
			driveId: odspResolvedUrl.driveId,
			itemId: odspResolvedUrl.itemId,
		};
		// Only the epochTracker from the returned cacheAndTracker is used below, so a fresh
		// NonPersistentCache is sufficient here.
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
		const getAuthHeader = toInstrumentedOdspStorageTokenFetcher(
			extLogger,
			urlParts,
			this.getStorageTokenForVersions,
		);
		return createOdspVersionManager({
			urlParts,
			getAuthHeader,
			epochTracker: cacheAndTracker.epochTracker,
			logger: extLogger,
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
}
