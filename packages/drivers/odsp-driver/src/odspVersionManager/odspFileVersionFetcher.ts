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

import { currentReadVersion, parseCompactSnapshotResponse } from "../compactSnapshotParser.js";
import type { IOdspSnapshot } from "../contracts.js";
import type { EpochTracker } from "../epochTracker.js";
import { getHeadersWithAuth } from "../getUrlAndHeadersWithAuth.js";
import { OdspDeltaStorageService } from "../odspDeltaStorageService.js";
import { convertOdspSnapshotToSnapshotTreeAndBlobs } from "../odspSnapshotParser.js";
import { getApiRoot } from "../odspUrlHelper.js";
import { fetchArray, getWithRetryForTokenRefresh } from "../odspUtils.js";

import type { OdspFileVersionRef, IOdspFileVersionFetcher } from "./odspVersionManager.js";

/**
 * Raw shape of a OneDrive/SharePoint driveItem version (an entry in the `/versions` response).
 * @see https://learn.microsoft.com/en-us/onedrive/developer/rest-api/resources/driveitemversion
 */
interface IDriveItemVersion {
	/** The version's label, e.g. "42.0". */
	readonly id: string;
	readonly lastModifiedDateTime: string;
}

/** A single page of the driveItem `/versions` response. */
interface IDriveItemVersionsPage {
	readonly value?: IDriveItemVersion[];
	/** Absolute URL of the next page, present only while more versions remain. */
	readonly "@odata.nextLink"?: string;
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
			const method = "GET";
			const versions: OdspFileVersionRef[] = [];
			// The file's version history (distinct from the driver's snapshot list), from the same API
			// root as the snapshot call so consumer (ODC) and enterprise (SPO) hosts are handled alike.
			// A long history is paged, so follow `@odata.nextLink` until it is absent; otherwise a base
			// version beyond the first page would be missed and wrongly reported as "no base version".
			let url = `${getApiRoot(new URL(siteUrl))}/drives/${driveId}/items/${itemId}/versions`;
			do {
				const token = await getAuthHeader(
					{ ...options, request: { url, method } },
					"FileVersions",
				);
				const headers = getHeadersWithAuth(token);
				const response = await epochTracker.fetchAndParseAsJSON<{
					value?: IDriveItemVersion[];
				}>(url, { method, headers }, "versions");
				const page = response.content as IDriveItemVersionsPage;
				// The API returns versions newest-first.
				for (const version of page.value ?? []) {
					versions.push({
						versionId: version.id,
						lastModifiedDateTime: version.lastModifiedDateTime,
					});
				}
				url = page["@odata.nextLink"] ?? "";
			} while (url);
			return versions;
		});

	const resolveSequenceNumber = async (versionId: string): Promise<number> =>
		getWithRetryForTokenRefresh(async (options) => {
			// A file version's sequence number lives inside that version's snapshot, so fetch the snapshot
			// from the version-scoped endpoint. `blobs=2` inlines blob contents so the `.protocol/attributes`
			// blob (which carries the sequence number) is included; `deltas=1` is intentionally omitted, as
			// it would bundle the op stream and its op-level sequence numbers.
			const url = `${getApiRoot(new URL(siteUrl))}/drives/${driveId}/items/${itemId}/versions/${encodeURIComponent(
				versionId,
			)}/opStream/snapshots/trees/latest?blobs=2`;
			const method = "GET";
			const token = await getAuthHeader(
				{ ...options, request: { url, method } },
				"FileVersionSnapshot",
			);
			const headers = getHeadersWithAuth(token);
			// The server can return the snapshot in one of two equivalent framings: verbose JSON, or
			// "ms-fluid" — ODSP's compact binary encoding of the same snapshot. Advertise both, and pin the
			// binary format version (as the driver's own snapshot fetch does) so the server cannot hand back
			// a binary version this code's parser does not understand.
			headers.accept = `application/json, application/ms-fluid; v=${currentReadVersion}`;
			const response = await epochTracker.fetch(url, { method, headers }, "treesLatest");
			const contentType = response.headers.get("content-type") ?? "";
			let sequenceNumber: number | undefined;
			if (contentType.includes("application/json")) {
				// JSON framing: read it with the driver's JSON snapshot parser.
				const snapshotJson = (await response.content.json()) as IOdspSnapshot;
				sequenceNumber =
					convertOdspSnapshotToSnapshotTreeAndBlobs(snapshotJson).sequenceNumber;
			} else {
				// ms-fluid framing: the compact binary form; read it with the driver's compact-snapshot parser.
				const bytes = new Uint8Array(await response.content.arrayBuffer());
				sequenceNumber = parseCompactSnapshotResponse(bytes, logger).sequenceNumber;
			}
			// A version's snapshot must carry a sequence number; a missing one is surfaced as an error
			// naming the version, rather than returning a wrong value.
			if (sequenceNumber === undefined) {
				throw new Error(`ODSP file version ${versionId} snapshot is missing a sequenceNumber`);
			}
			return sequenceNumber;
		});

	const itemRoot = `${getApiRoot(new URL(siteUrl))}/drives/${driveId}/items/${itemId}`;

	// Reads the `x-fluid-epoch` header from `url`. Deliberately uses the raw fetch helper instead of
	// `epochTracker.fetch`: the whole point is to COMPARE the base version's epoch against the live
	// document's epoch, but the shared EpochTracker pins to the first epoch it sees and throws on the
	// second (divergent) read - so it could never yield two epochs to compare. `fetchArray` also lets
	// the body (JSON or ms-fluid binary) be consumed and discarded; only the header is needed.
	const readEpoch = async (url: string, scenarioName: string): Promise<string | undefined> =>
		getWithRetryForTokenRefresh(async (options) => {
			const method = "GET";
			const token = await getAuthHeader(
				{ ...options, request: { url, method } },
				scenarioName,
			);
			const headers = getHeadersWithAuth(token);
			const response = await fetchArray(url, { method, headers });
			return response.headers.get("x-fluid-epoch") ?? undefined;
		});

	const getLiveDocumentEpoch = async (): Promise<string | undefined> =>
		// The (unversioned) live snapshot endpoint is a current-file read, so its epoch is the live
		// document's epoch. `blobs=0` keeps the response to the tree metadata.
		readEpoch(`${itemRoot}/opStream/snapshots/trees/latest?blobs=0`, "LiveEpoch");

	const getRecoverableVersionEpoch = async (versionId: string): Promise<string | undefined> =>
		readEpoch(
			`${itemRoot}/versions/${encodeURIComponent(versionId)}/opStream/snapshots/trees/latest?blobs=0`,
			"FileVersionEpoch",
		);

	// Ops are read from the LIVE document's delta feed (versions do not have their own op streams).
	// Reuses OdspDeltaStorageService for its tested transport, retry, and epoch validation.
	const deltaStorage = new OdspDeltaStorageService(
		`${itemRoot}/opStream`,
		getAuthHeader,
		epochTracker,
		logger,
	);
	const fetchOps = async (from: number, to: number): Promise<number[]> => {
		const result = await deltaStorage.get(
			from,
			to,
			{ reason: "PointInTimeOpsValidation" },
			"PointInTimeOpsValidation",
		);
		return result.messages.map((message) => message.sequenceNumber);
	};

	return {
		listFileVersions,
		resolveSequenceNumber,
		getLiveDocumentEpoch,
		getRecoverableVersionEpoch,
		fetchOps,
	};
}
