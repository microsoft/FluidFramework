/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * An {@link IOdspFileVersionFetcher} backed by the ODSP REST APIs:
 * - GET /_api/v2.1/.../versions -- enumerate the file's versions.
 * - GET /_api/v2.1/.../versions/{label}/opStream/snapshots/trees/latest?blobs=2 -- fetch a version's
 *   snapshot and read its sequence number, parsed with the driver's snapshot parser.
 */

import type {
	IOdspUrlParts,
	InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { parseCompactSnapshotResponse } from "../compactSnapshotParser.js";
import type { IOdspSnapshot } from "../contracts.js";
import type { EpochTracker } from "../epochTracker.js";
import { getHeadersWithAuth } from "../getUrlAndHeadersWithAuth.js";
import { convertOdspSnapshotToSnapshotTreeAndBlobs } from "../odspSnapshotParser.js";
import { getApiRoot } from "../odspUrlHelper.js";
import { getWithRetryForTokenRefresh } from "../odspUtils.js";

import type { OdspFileVersionRef, IOdspFileVersionFetcher } from "./odspVersionManager.js";

/**
 * Raw shape of a OneDrive/SharePoint driveItem version (an entry in the `/versions` response).
 * @see https://learn.microsoft.com/en-us/onedrive/developer/rest-api/resources/driveitemversion
 */
interface IDriveItemVersion {
	/** The version's label, e.g. "42.0". */
	readonly id: string;
	readonly lastModifiedDateTime: string;
	readonly size: number;
}

/**
 * Inputs needed to make authenticated requests against a specific ODSP file.
 */
export interface OdspFileVersionFetcherProps {
	readonly urlParts: IOdspUrlParts;
	readonly getAuthHeader: InstrumentedStorageTokenFetcher;
	readonly epochTracker: EpochTracker;
	readonly logger: TelemetryLoggerExt;
}

/**
 * Create an {@link IOdspFileVersionFetcher} that talks to a specific ODSP file.
 */
export function createOdspFileVersionFetcher(
	props: OdspFileVersionFetcherProps,
): IOdspFileVersionFetcher {
	const { urlParts, getAuthHeader, epochTracker, logger } = props;
	const { siteUrl, driveId, itemId } = urlParts;

	const listFileVersions = async (): Promise<OdspFileVersionRef[]> =>
		getWithRetryForTokenRefresh(async (options) => {
			// The file's version history (distinct from the driver's snapshot list), from the same API
			// root as the snapshot call so consumer (ODC) and enterprise (SPO) hosts are handled alike.
			const url = `${getApiRoot(new URL(siteUrl))}/drives/${driveId}/items/${itemId}/versions`;
			const method = "GET";
			const token = await getAuthHeader(
				{ ...options, request: { url, method } },
				"FileVersions",
			);
			const headers = getHeadersWithAuth(token);
			const response = await epochTracker.fetchAndParseAsJSON<{ value?: IDriveItemVersion[] }>(
				url,
				{ method, headers },
				"versions",
			);
			// The API returns versions newest-first.
			return (response.content.value ?? []).map((version) => ({
				versionId: version.id,
				lastModifiedDateTime: version.lastModifiedDateTime,
				sizeBytes: version.size,
			}));
		});

	const resolveSequenceNumber = async (versionId: string): Promise<number> =>
		getWithRetryForTokenRefresh(async (options) => {
			// Fetch the version's snapshot from the version-scoped snapshot endpoint, which returns the
			// driver's native json / ms-fluid framing. `blobs=2` inlines blob contents (including the
			// `.protocol/attributes` blob that holds the sequence number). `deltas=1` is intentionally
			// omitted; it would bundle the op stream and its op-level sequence numbers.
			const url = `${getApiRoot(new URL(siteUrl))}/drives/${driveId}/items/${itemId}/versions/${encodeURIComponent(
				versionId,
			)}/opStream/snapshots/trees/latest?blobs=2`;
			const method = "GET";
			const token = await getAuthHeader(
				{ ...options, request: { url, method } },
				"FileVersionSnapshot",
			);
			const headers = getHeadersWithAuth(token);
			const response = await epochTracker.fetch(url, { method, headers }, "treesLatest");
			const contentType = response.headers.get("content-type") ?? "";
			if (contentType.includes("application/json")) {
				const snapshotJson = (await response.content.json()) as IOdspSnapshot;
				return requireSequenceNumber(
					convertOdspSnapshotToSnapshotTreeAndBlobs(snapshotJson).sequenceNumber,
					versionId,
				);
			}
			// application/ms-fluid (compact binary)
			const bytes = new Uint8Array(await response.content.arrayBuffer());
			return requireSequenceNumber(
				parseCompactSnapshotResponse(bytes, logger).sequenceNumber,
				versionId,
			);
		});

	return { listFileVersions, resolveSequenceNumber };
}

/**
 * A version's snapshot must carry a sequence number; a missing one is surfaced as an error rather
 * than returning a wrong value.
 */
function requireSequenceNumber(sequenceNumber: number | undefined, versionId: string): number {
	if (sequenceNumber === undefined) {
		throw new Error(`ODSP file version ${versionId} snapshot is missing a sequenceNumber`);
	}
	return sequenceNumber;
}
