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
	IOdspResolvedUrl,
	IOdspUrlParts,
	OdspResourceTokenFetchOptions,
	TokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import {
	UsageError,
	createChildLogger,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import {
	createOdspCacheAndTracker,
	type EpochTracker,
	type ICacheAndTracker,
} from "../epochTracker.js";
import { NonPersistentCache } from "../odspCache.js";
import { getApiRoot } from "../odspUrlHelper.js";
import {
	createOdspLogger,
	getOdspResolvedUrl,
	toInstrumentedOdspStorageTokenFetcher,
} from "../odspUtils.js";
import {
	createOdspVersionManager,
	type IOdspVersionManager,
	// eslint-disable-next-line import-x/no-internal-modules -- direct import keeps the PIT implementation in one lazy chunk
} from "../odspVersionManager/odspVersionManager.js";

import { OdspPointInTimeDocumentService } from "./odspPointInTimeDocumentService.js";

interface IPointInTimeDocumentServiceDependencies {
	createVersionManager?: (
		odspResolvedUrl: IOdspResolvedUrl,
		logger: TelemetryLoggerExt,
		epochTracker: EpochTracker,
	) => IOdspVersionManager | Promise<IOdspVersionManager>;
	resolveFileVersion?: (
		resolvedUrl: IResolvedUrl,
		fileVersion: string,
	) => IOdspResolvedUrl | Promise<IOdspResolvedUrl>;
}

export interface ICreatePointInTimeDocumentServiceProps {
	resolvedUrl: IResolvedUrl;
	targetSequenceNumber: number;
	logger?: ITelemetryBaseLogger;
	clientIsSummarizer?: boolean;
	persistedCache: IPersistedCache;
	getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>;
	createDocumentService: (
		resolvedUrl: IResolvedUrl,
		logger: ITelemetryBaseLogger,
		cacheAndTracker: ICacheAndTracker,
		clientIsSummarizer?: boolean,
	) => Promise<IDocumentService>;
	dependencies?: IPointInTimeDocumentServiceDependencies;
}

export function resolveFileVersion(
	resolvedUrl: IResolvedUrl,
	fileVersion: string,
): IOdspResolvedUrl {
	const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);
	const urlBase = `${getApiRoot(new URL(odspResolvedUrl.siteUrl))}/drives/${
		odspResolvedUrl.driveId
	}/items/${odspResolvedUrl.itemId}/versions/${fileVersion}/`;
	return {
		...odspResolvedUrl,
		endpoints: {
			snapshotStorageUrl: `${urlBase}opStream/snapshots`,
			attachmentPOSTStorageUrl: `${urlBase}opStream/attachment`,
			attachmentGETStorageUrl: `${urlBase}opStream/attachments`,
			deltaStorageUrl: `${urlBase}opStream`,
		},
		fileVersion,
	};
}

export function createVersionManager(
	odspResolvedUrl: IOdspResolvedUrl,
	logger: TelemetryLoggerExt,
	epochTracker: EpochTracker,
	getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
): IOdspVersionManager {
	const urlParts: IOdspUrlParts = {
		siteUrl: odspResolvedUrl.siteUrl,
		driveId: odspResolvedUrl.driveId,
		itemId: odspResolvedUrl.itemId,
	};
	const getAuthHeader = toInstrumentedOdspStorageTokenFetcher(
		logger,
		urlParts,
		getStorageToken,
	);
	return createOdspVersionManager({
		urlParts,
		getAuthHeader,
		epochTracker,
		logger,
	});
}

export async function createPointInTimeDocumentService({
	resolvedUrl,
	targetSequenceNumber,
	logger,
	clientIsSummarizer,
	persistedCache,
	getStorageToken,
	createDocumentService,
	dependencies,
}: ICreatePointInTimeDocumentServiceProps): Promise<IDocumentService> {
	const odspLogger = createOdspLogger(logger);
	const extLogger = createChildLogger({ logger: odspLogger });
	const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);
	const cacheAndTracker = createOdspCacheAndTracker(
		persistedCache,
		new NonPersistentCache(),
		{
			resolvedUrl: odspResolvedUrl,
			docId: odspResolvedUrl.hashedDocumentId,
			fileVersion: odspResolvedUrl.fileVersion,
		},
		extLogger,
		clientIsSummarizer,
	);
	const versionManager = await (
		dependencies?.createVersionManager ??
		((url, versionLogger, epochTracker) =>
			createVersionManager(url, versionLogger, epochTracker, getStorageToken))
	)(odspResolvedUrl, extLogger, cacheAndTracker.epochTracker);
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
	const recoverableResolvedUrl = await (
		dependencies?.resolveFileVersion ?? resolveFileVersion
	)(resolvedUrl, baseResult.base.versionId);
	const recoverableDocumentService = await createDocumentService(
		recoverableResolvedUrl,
		odspLogger,
		cacheAndTracker,
		clientIsSummarizer,
	);
	const liveDocumentService = await createDocumentService(
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
}
