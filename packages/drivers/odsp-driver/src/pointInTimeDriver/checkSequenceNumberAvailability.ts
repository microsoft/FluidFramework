/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IDocumentDeltaStorageService,
	IDocumentService,
} from "@fluidframework/driver-definitions/internal";
/* eslint-disable import-x/no-internal-modules -- The check consumes legacy public types and internal version management. */
import type {
	SequenceNumberAvailability,
	SequenceNumberAvailabilityReason,
} from "@fluidframework/driver-definitions/legacy";
import type { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions/internal";
import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";
import { UsageError } from "@fluidframework/driver-utils/internal";
import {
	createChildLogger,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import { createOdspCacheAndTracker, type EpochTracker } from "../epochTracker.js";
import { NonPersistentCache } from "../odspCache.js";
import type { OdspPointInTimeAvailabilityImplementationProps } from "../odspDocumentServiceFactoryCore.js";
import {
	createOdspLogger,
	getOdspResolvedUrl,
	toInstrumentedOdspStorageTokenFetcher,
} from "../odspUtils.js";
import {
	createOdspVersionManager,
	type AvailabilityBaseResults,
	type IOdspVersionManager,
} from "../odspVersionManager/odspVersionManager.js";
/* eslint-enable import-x/no-internal-modules */
import { MaterializationBoundaryTracker } from "./materializationBoundary.js";

interface PointInTimeAvailabilityDependencies {
	readonly createVersionManager?: (
		odspResolvedUrl: IOdspResolvedUrl,
		logger: TelemetryLoggerExt,
		epochTracker: EpochTracker,
	) => IOdspVersionManager;
}

interface RangeVerification {
	readonly nextExpected: number;
	readonly invalidBoundaries: ReadonlySet<number>;
	readonly error?: unknown;
}

function unavailable(
	sequenceNumber: number,
	reason: SequenceNumberAvailabilityReason,
): SequenceNumberAvailability {
	return { sequenceNumber, status: "unavailable", reason };
}

function unknown(sequenceNumber: number): SequenceNumberAvailability {
	return { sequenceNumber, status: "unknown", reason: "transientFailure" };
}

function isAborted(signal: AbortSignal | undefined): boolean {
	return signal?.aborted === true;
}

function isMissingOpsError(error: unknown): boolean {
	return (
		(error as { readonly errorType?: unknown } | undefined)?.errorType ===
		OdspErrorTypes.cannotCatchUp
	);
}

function classifyFailure(
	sequenceNumber: number,
	error: unknown,
	signal?: AbortSignal,
): SequenceNumberAvailability {
	if (isAborted(signal)) {
		return unknown(sequenceNumber);
	}
	if (isMissingOpsError(error)) {
		return unavailable(sequenceNumber, "missingBridgingOps");
	}
	return unknown(sequenceNumber);
}

async function verifyRange(
	deltaStorage: IDocumentDeltaStorageService,
	from: number,
	to: number,
	signal?: AbortSignal,
): Promise<RangeVerification> {
	let nextExpected = from;
	const invalidBoundaries = new Set<number>();
	const boundaryTracker = new MaterializationBoundaryTracker();
	try {
		const stream = deltaStorage.fetchMessages(
			from,
			to,
			signal,
			false,
			"PointInTimeAvailability",
		);
		while (true) {
			const result = await stream.read();
			if (result.done) {
				return isAborted(signal)
					? {
							nextExpected,
							invalidBoundaries,
							error: signal?.reason ?? new Error("Availability check aborted"),
						}
					: { nextExpected, invalidBoundaries };
			}
			for (const message of result.value) {
				if (message.sequenceNumber !== nextExpected) {
					return {
						nextExpected,
						invalidBoundaries,
						error: new Error(
							`Delta storage returned sequence number ${message.sequenceNumber}; expected ${nextExpected}.`,
						),
					};
				}
				if (!boundaryTracker.observe(message)) {
					invalidBoundaries.add(message.sequenceNumber);
				}
				nextExpected++;
			}
		}
	} catch (error) {
		return { nextExpected, invalidBoundaries, error };
	}
}

function createVersionManager(
	props: OdspPointInTimeAvailabilityImplementationProps,
	odspResolvedUrl: IOdspResolvedUrl,
	logger: TelemetryLoggerExt,
	epochTracker: EpochTracker,
): IOdspVersionManager {
	const getAuthHeader = toInstrumentedOdspStorageTokenFetcher(
		logger,
		{
			siteUrl: odspResolvedUrl.siteUrl,
			driveId: odspResolvedUrl.driveId,
			itemId: odspResolvedUrl.itemId,
		},
		props.getStorageToken,
	);
	return createOdspVersionManager({
		urlParts: {
			siteUrl: odspResolvedUrl.siteUrl,
			driveId: odspResolvedUrl.driveId,
			itemId: odspResolvedUrl.itemId,
		},
		getAuthHeader,
		epochTracker,
		logger,
		requestHeaders: props.requestHeaders,
	});
}

/**
 * Checks point-in-time availability for an ODSP document.
 *
 * @param props - The resolved document, sequence numbers, storage dependencies, and cancellation
 * signal.
 * @returns One availability result for each input sequence number, in input order.
 *
 * @legacy @beta
 */
export async function checkSequenceNumberAvailability(
	props: OdspPointInTimeAvailabilityImplementationProps,
): Promise<readonly SequenceNumberAvailability[]> {
	return checkSequenceNumberAvailabilityCore(props);
}

/**
 * Checks availability with replaceable dependencies for testing.
 *
 * @internal
 */
export async function checkSequenceNumberAvailabilityCore(
	props: OdspPointInTimeAvailabilityImplementationProps,
	dependencies: PointInTimeAvailabilityDependencies = {},
): Promise<readonly SequenceNumberAvailability[]> {
	const { sequenceNumbers, signal } = props;
	for (const sequenceNumber of sequenceNumbers) {
		if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber < 0) {
			throw new UsageError(
				`sequenceNumbers must contain only non-negative safe integers, got ${sequenceNumber}.`,
			);
		}
	}
	if (sequenceNumbers.length === 0) {
		return [];
	}
	if (isAborted(signal)) {
		return sequenceNumbers.map(unknown);
	}

	const odspLogger = createOdspLogger(props.logger);
	const logger = createChildLogger({ logger: odspLogger });
	const odspResolvedUrl = getOdspResolvedUrl(props.resolvedUrl);
	const cacheAndTracker = createOdspCacheAndTracker(
		props.persistedCache,
		new NonPersistentCache(),
		{
			resolvedUrl: odspResolvedUrl,
			docId: odspResolvedUrl.hashedDocumentId,
			fileVersion: odspResolvedUrl.fileVersion,
		},
		logger,
		props.clientIsSummarizer,
		props.requestHeaders,
	);
	const versionManager = (
		dependencies.createVersionManager ??
		((url, versionLogger, epochTracker) =>
			createVersionManager(props, url, versionLogger, epochTracker))
	)(odspResolvedUrl, logger, cacheAndTracker.epochTracker);

	let availabilityBases: AvailabilityBaseResults;
	try {
		availabilityBases = await versionManager.findBasesForSeqs(sequenceNumbers, signal);
	} catch {
		// Discovery failures do not prove either lineage loss or a missing bridge. In
		// particular, ODSP uses the same epoch error when a restore races the query.
		return sequenceNumbers.map(unknown);
	}
	if (isAborted(signal)) {
		return sequenceNumbers.map(unknown);
	}

	const results: (SequenceNumberAvailability | undefined)[] = Array.from({
		length: sequenceNumbers.length,
	});
	const groups = new Map<string, { readonly from: number; readonly indexes: number[] }>();
	for (let index = 0; index < sequenceNumbers.length; index++) {
		const target = sequenceNumbers[index];
		const base = availabilityBases.bases[index];
		if (target === undefined || base === undefined) {
			continue;
		}
		if (
			availabilityBases.observedStorageSequenceNumber !== undefined &&
			target > availabilityBases.observedStorageSequenceNumber
		) {
			// The storage snapshot can lag a sequence already observed on PUSH. It is not an
			// authoritative document-head source, so this condition is retryable.
			results[index] = unknown(target);
		} else if (base.kind === "noBaseVersion") {
			results[index] =
				base.oldestResolvedSeq === undefined ||
				availabilityBases.lineageBoundaryObserved === true
					? unknown(target)
					: unavailable(target, "noRetainedBase");
		} else if (target <= base.base.sequenceNumber) {
			results[index] = { sequenceNumber: target, status: "available" };
		} else {
			const group = groups.get(base.base.versionId) ?? {
				// The actual point-in-time load may use different snapshot options, so only
				// the snapshot's base sequence is guaranteed to be shared coverage.
				from: base.base.sequenceNumber + 1,
				indexes: [],
			};
			group.indexes.push(index);
			groups.set(base.base.versionId, group);
		}
	}
	if (groups.size === 0) {
		return results.map((result, index) => result ?? unknown(sequenceNumbers[index]));
	}

	let liveService: IDocumentService | undefined;
	try {
		liveService = await props.createDocumentService(
			props.resolvedUrl,
			odspLogger,
			cacheAndTracker,
			props.clientIsSummarizer,
		);
		if (isAborted(signal)) {
			return results.map((result, index) => result ?? unknown(sequenceNumbers[index]));
		}
		// Match point-in-time loading: the live service supplies only delta storage. Connecting
		// it to storage would seed bundled live-snapshot ops that the actual load cannot use.
		const deltaStorage = await liveService.connectToDeltaStorage();
		if (isAborted(signal)) {
			return results.map((result, index) => result ?? unknown(sequenceNumbers[index]));
		}

		for (const { from, indexes } of groups.values()) {
			let to = from;
			for (const index of indexes) {
				const target = sequenceNumbers[index];
				if (target !== undefined) {
					to = Math.max(to, target + 1);
				}
			}
			const verification = await verifyRange(deltaStorage, from, to, signal);
			if (
				(verification.error as { errorType?: unknown } | undefined)?.errorType ===
				OdspErrorTypes.fileOverwrittenInStorage
			) {
				return sequenceNumbers.map(unknown);
			}
			for (const index of indexes) {
				const target = sequenceNumbers[index];
				if (target < verification.nextExpected) {
					results[index] = verification.invalidBoundaries.has(target)
						? unavailable(target, "notMaterializationBoundary")
						: { sequenceNumber: target, status: "available" };
				} else if (verification.error === undefined) {
					results[index] = unavailable(target, "missingBridgingOps");
				} else {
					results[index] = classifyFailure(target, verification.error, signal);
				}
			}
		}
	} catch (error) {
		if (
			(error as { errorType?: unknown } | undefined)?.errorType ===
			OdspErrorTypes.fileOverwrittenInStorage
		) {
			return sequenceNumbers.map(unknown);
		}
		for (const { indexes } of groups.values()) {
			for (const index of indexes) {
				results[index] ??= unknown(sequenceNumbers[index]);
			}
		}
	} finally {
		liveService?.dispose();
	}
	return results.map((result, index) => result ?? unknown(sequenceNumbers[index]));
}
