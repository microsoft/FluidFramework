/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IDocumentService,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/driver-utils/internal";
import type {
	IOdspResolvedUrl,
	IOdspUrlParts,
} from "@fluidframework/odsp-driver-definitions/internal";
import {
	createChildLogger,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import { createOdspCacheAndTracker, type EpochTracker } from "../epochTracker.js";
import { NonPersistentCache } from "../odspCache.js";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver.js";
import type { IOdspPointInTimeDocumentServiceImplementationProps } from "../odspDocumentServiceFactoryCore.js";
import {
	createOdspLogger,
	getOdspResolvedUrl,
	toInstrumentedOdspStorageTokenFetcher,
} from "../odspUtils.js";
import {
	createOdspVersionManager,
	type IOdspVersionManager,
	// eslint-disable-next-line import-x/no-internal-modules -- the feature implementation owns version selection
} from "../odspVersionManager/odspVersionManager.js";

import { OdspPointInTimeDocumentService } from "./odspPointInTimeDocumentService.js";

interface IPointInTimeDocumentServiceDependencies {
	readonly createVersionManager?: (
		odspResolvedUrl: IOdspResolvedUrl,
		logger: TelemetryLoggerExt,
		epochTracker: EpochTracker,
	) => IOdspVersionManager | Promise<IOdspVersionManager>;
	readonly resolveFileVersion?: (
		resolvedUrl: IResolvedUrl,
		fileVersion: string,
	) => IResolvedUrl | Promise<IResolvedUrl>;
}

async function createVersionManager(
	odspResolvedUrl: IOdspResolvedUrl,
	logger: TelemetryLoggerExt,
	epochTracker: EpochTracker,
	getStorageToken: IOdspPointInTimeDocumentServiceImplementationProps["getStorageToken"],
): Promise<IOdspVersionManager> {
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

async function resolveFileVersion(
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

/**
 * ODSP's point-in-time document service implementation.
 *
 * @remarks Import this function from the dedicated point-in-time entrypoint and inject it through
 * {@link IOdspDocumentServiceFactoryOptions.pointInTimeDocumentServiceImplementation}.
 *
 * @param props - ODSP service dependencies and point-in-time load parameters supplied by the factory.
 * @returns A read-only ODSP document service materialized at the requested sequence number.
 *
 * @legacy @beta
 */
export async function createPointInTimeDocumentService(
	props: IOdspPointInTimeDocumentServiceImplementationProps,
): Promise<IDocumentService> {
	return createPointInTimeDocumentServiceCore(props);
}

/**
 * Creates the point-in-time service with replaceable dependencies for testing.
 * @internal
 */
export async function createPointInTimeDocumentServiceCore(
	{
		resolvedUrl,
		targetSequenceNumber,
		logger,
		clientIsSummarizer,
		persistedCache,
		getStorageToken,
		createDocumentService,
	}: IOdspPointInTimeDocumentServiceImplementationProps,
	dependencies: IPointInTimeDocumentServiceDependencies = {},
): Promise<OdspPointInTimeDocumentService> {
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
		dependencies.createVersionManager ??
		(async (url, versionLogger, epochTracker) =>
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

	const recoverableResolvedUrl = await (dependencies.resolveFileVersion ?? resolveFileVersion)(
		resolvedUrl,
		baseResult.base.versionId,
	);
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
