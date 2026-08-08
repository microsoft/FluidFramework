/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * An {@link IOdspFileVersionFetcher} backed by the ODSP REST APIs:
 * - GET /_api/v2.1/.../versions -- enumerate the file's versions.
 * - GET /_api/v2.1/.../versions/{label}/opStream/snapshots/trees/latest?blobs=2 -- fetch a version's
 *   snapshot and read its sequence number, parsed with the driver's snapshot parser.
 * - GET /_api/v2.1/.../[versions/{label}/]opStream/snapshots/trees/latest?blobs=0 -- read a version's
 *   or the live document's ODSP epoch (`x-fluid-epoch`) to compare their lineage.
 */

import { NonRetryableError } from "@fluidframework/driver-utils/internal";
import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";
import type {
	IOdspUrlParts,
	InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { currentReadVersion, parseCompactSnapshotResponse } from "../compactSnapshotParser.js";
import type { IOdspSnapshot } from "../contracts.js";
import type { EpochTracker } from "../epochTracker.js";
import { getHeadersWithAuth } from "../getUrlAndHeadersWithAuth.js";
import { convertOdspSnapshotToSnapshotTreeAndBlobs } from "../odspSnapshotParser.js";
import { getApiRoot } from "../odspUrlHelper.js";
import { fetchArray, getWithRetryForTokenRefresh } from "../odspUtils.js";
import { pkgVersion as driverVersion } from "../packageVersion.js";

/**
 * A single ODSP file version, as listed by the file's version history.
 */
export interface OdspFileVersionRef {
	/**
	 * The version's label (e.g. `"42.0"`), used to address the version when fetching it.
	 */
	readonly versionId: string;
	/**
	 * Last-modified timestamp of this version, ISO-8601.
	 */
	readonly lastModifiedDateTime: string;
}

/**
 * Provides a file's versions and resolves each version's Fluid sequence number. Injected into
 * the version manager so the selection logic does not depend on how versions are fetched.
 */
export interface IOdspFileVersionFetcher {
	/**
	 * Enumerate the file's versions, newest-first.
	 */
	listFileVersions(): Promise<OdspFileVersionRef[]>;
	/**
	 * Resolve a single version's Fluid sequence number. Throws on failure rather than returning a
	 * wrong value.
	 */
	resolveSequenceNumber(versionId: string): Promise<number>;
	/**
	 * Read the live document's current ODSP epoch (`x-fluid-epoch`), or `undefined`. Epoch identifies
	 * the file's binary lineage and changes on a version restore or download-then-reupload; compared
	 * with {@link IOdspFileVersionFetcher.getRecoverableVersionEpoch} to confirm a base is on the live
	 * document's lineage.
	 */
	getLiveDocumentEpoch(): Promise<string | undefined>;
	/**
	 * Read the ODSP epoch of a specific file version, or `undefined`. See
	 * {@link IOdspFileVersionFetcher.getLiveDocumentEpoch}.
	 */
	getRecoverableVersionEpoch(versionId: string): Promise<string | undefined>;
}

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
			// The sequence number lives in the version snapshot's `.protocol/attributes` blob, so fetch the
			// version-scoped snapshot with `blobs=2` to inline it. No op stream needed.
			const url = `${getApiRoot(new URL(siteUrl))}/drives/${driveId}/items/${itemId}/versions/${encodeURIComponent(
				versionId,
			)}/opStream/snapshots/trees/latest?blobs=2`;
			const method = "GET";
			const token = await getAuthHeader(
				{ ...options, request: { url, method } },
				"FileVersionSnapshot",
			);
			const headers = getHeadersWithAuth(token);
			// The snapshot comes back as JSON or "ms-fluid" (ODSP's compact binary form). Accept both and
			// pin the binary version (as the driver's snapshot fetch does) so the parser can read it.
			headers.accept = `application/json, application/ms-fluid; v=${currentReadVersion}`;
			const response = await epochTracker.fetch(url, { method, headers }, "treesLatest");
			const contentType = response.headers.get("content-type") ?? "";
			let sequenceNumber: number | undefined;
			if (contentType.includes("application/json")) {
				// JSON framing: read it with the driver's JSON snapshot parser.
				const snapshotJson = (await response.content.json()) as IOdspSnapshot;
				sequenceNumber =
					convertOdspSnapshotToSnapshotTreeAndBlobs(snapshotJson).sequenceNumber;
			} else if (contentType.includes("application/ms-fluid")) {
				// ms-fluid framing: the compact binary form; read it with the driver's compact-snapshot parser.
				const bytes = new Uint8Array(await response.content.arrayBuffer());
				sequenceNumber = parseCompactSnapshotResponse(bytes, logger).sequenceNumber;
			} else {
				// Neither framing (e.g. an HTML error page). Throw the driver's typed bad-response error
				// (like fetchSnapshot.ts): canRetry=false stops the loader re-driving, while the
				// incorrectServerResponse errorType still earns one wire-retry from getWithRetryForTokenRefresh.
				throw new NonRetryableError(
					`ODSP file version ${versionId} snapshot returned an unexpected content-type`,
					OdspErrorTypes.incorrectServerResponse,
					{ driverVersion, contentType, accept: headers.accept },
				);
			}
			// The sequence number must be a non-negative integer; a missing or malformed one throws the same
			// typed error as above rather than feeding a wrong value into base selection.
			if (
				!(
					typeof sequenceNumber === "number" &&
					Number.isInteger(sequenceNumber) &&
					sequenceNumber >= 0
				)
			) {
				throw new NonRetryableError(
					`ODSP file version ${versionId} snapshot has a missing or invalid sequenceNumber (${String(sequenceNumber)})`,
					OdspErrorTypes.incorrectServerResponse,
					{ driverVersion, contentType, accept: headers.accept },
				);
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

	return {
		listFileVersions,
		resolveSequenceNumber,
		getLiveDocumentEpoch,
		getRecoverableVersionEpoch,
	};
}
