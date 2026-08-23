/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * An {@link IOdspFileVersionFetcher} backed by the ODSP REST APIs:
 * - GET /_api/v2.1/.../versions -- enumerate the file's versions.
 * - GET /_api/v2.1/.../versions/{label}/opStream/snapshots/trees/latest?blobs=2 -- fetch a version's
 *   JSON snapshot and read its top-level sequence number. The shared EpochTracker validates lineage
 *   from these responses and the document-service reads.
 */

import { NonRetryableError } from "@fluidframework/driver-utils/internal";
import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";
import type {
	IOdspUrlParts,
	InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";

import type { EpochTracker } from "../epochTracker.js";
import { getHeadersWithAuth } from "../getUrlAndHeadersWithAuth.js";
import { getApiRoot } from "../odspUrlHelper.js";
import { getWithRetryForTokenRefresh } from "../odspUtils.js";
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
}

/**
 * Create an {@link IOdspFileVersionFetcher} that talks to a specific ODSP file.
 */
export function createOdspFileVersionFetcher(
	props: OdspFileVersionFetcherProps,
): IOdspFileVersionFetcher {
	const { urlParts, getAuthHeader, epochTracker } = props;
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
			// PIT only needs the top-level sequence number, so request JSON and avoid bringing the general
			// JSON/compact snapshot parsers into the optional PIT bundle.
			headers.accept = "application/json";
			const response = await epochTracker.fetch(url, { method, headers }, "treesLatest");
			const contentType = response.headers.get("content-type") ?? "";
			if (!contentType.includes("application/json")) {
				throw new NonRetryableError(
					`ODSP file version ${versionId} snapshot did not honor the JSON accept header`,
					OdspErrorTypes.incorrectServerResponse,
					{ driverVersion, contentType, accept: headers.accept },
				);
			}
			const snapshot = (await response.content.json()) as {
				readonly trees?: readonly [{ readonly sequenceNumber?: unknown }];
			};
			const sequenceNumber = snapshot.trees?.[0]?.sequenceNumber;
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

	return {
		listFileVersions,
		resolveSequenceNumber,
	};
}
