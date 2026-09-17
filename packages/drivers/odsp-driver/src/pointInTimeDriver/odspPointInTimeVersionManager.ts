/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NonRetryableError } from "@fluidframework/driver-utils/internal";
import {
	OdspErrorTypes,
	type IOdspUrlParts,
	type InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";

import type { EpochTracker } from "../epochTracker.js";
import { getHeadersWithAuth } from "../getUrlAndHeadersWithAuth.js";
import { getApiRoot } from "../odspUrlHelper.js";
import { getWithRetryForTokenRefresh } from "../odspUtils.js";
import { pkgVersion as driverVersion } from "../packageVersion.js";
import { mergeRequestHeaders } from "../requestHeaders.js";
/* eslint-disable import-x/no-internal-modules -- Both selectors share dependency-light selection semantics. */
import {
	type BaseForSeq,
	findBaseForSeqFromVersions,
} from "../odspVersionManager/odspVersionSelection.js";
/* eslint-enable import-x/no-internal-modules */

interface FileVersionRef {
	readonly versionId: string;
	readonly lastModifiedDateTime: string;
}

interface DriveItemVersion {
	readonly id: string;
	readonly lastModifiedDateTime: string;
}

interface DriveItemVersionsPage {
	readonly value?: DriveItemVersion[];
	readonly "@odata.nextLink"?: string;
}

export interface PointInTimeVersionFetcher {
	listFileVersions(): Promise<FileVersionRef[]>;
	resolveSequenceNumber(versionId: string): Promise<number>;
	validateLiveEpoch(): Promise<void>;
}

interface PointInTimeVersionManager {
	findBaseForSeq(target: number): Promise<BaseForSeq>;
}

export interface OdspPointInTimeVersionManagerProps {
	readonly urlParts: IOdspUrlParts;
	readonly getAuthHeader: InstrumentedStorageTokenFetcher;
	readonly epochTracker: EpochTracker;
	readonly requestHeaders?: Readonly<Record<string, string>>;
}

function createPointInTimeVersionFetcher(
	props: OdspPointInTimeVersionManagerProps,
): PointInTimeVersionFetcher {
	const { urlParts, getAuthHeader, epochTracker, requestHeaders } = props;
	const { siteUrl, driveId, itemId } = urlParts;
	const itemRoot = `${getApiRoot(new URL(siteUrl))}/drives/${driveId}/items/${itemId}`;

	const listFileVersions = async (): Promise<FileVersionRef[]> =>
		getWithRetryForTokenRefresh(async (options) => {
			const method = "GET";
			const versions: FileVersionRef[] = [];
			let url = `${itemRoot}/versions`;
			do {
				const token = await getAuthHeader(
					{ ...options, request: { url, method } },
					"FileVersions",
				);
				const headers = mergeRequestHeaders(requestHeaders, getHeadersWithAuth(token));
				const response = await epochTracker.fetchAndParseAsJSON<DriveItemVersionsPage>(
					url,
					{ method, headers },
					"versions",
				);
				const page = response.content;
				if (!Array.isArray(page.value)) {
					throw new NonRetryableError(
						"ODSP file-version response is missing its versions array.",
						OdspErrorTypes.incorrectServerResponse,
						{ driverVersion },
					);
				}
				for (const version of page.value) {
					versions.push({
						versionId: version.id,
						lastModifiedDateTime: version.lastModifiedDateTime,
					});
				}
				url = page["@odata.nextLink"] ?? "";
			} while (url !== "");
			return versions;
		});

	const resolveSequenceNumber = async (versionId: string): Promise<number> =>
		getWithRetryForTokenRefresh(async (options) => {
			const url = `${itemRoot}/versions/${encodeURIComponent(
				versionId,
			)}/opStream/snapshots/trees/latest?blobs=2`;
			const method = "GET";
			const token = await getAuthHeader(
				{ ...options, request: { url, method } },
				"FileVersionSnapshot",
			);
			const authHeaders = getHeadersWithAuth(token);
			authHeaders.accept = "application/json";
			const headers = mergeRequestHeaders(requestHeaders, authHeaders);
			const response = await epochTracker.fetch(url, { method, headers }, "treesLatest");
			const epoch = response.headers.get("x-fluid-epoch");
			if (epoch === null) {
				throw new NonRetryableError(
					`Cannot verify ODSP file version ${versionId} lineage because its response is missing an epoch.`,
					OdspErrorTypes.incorrectServerResponse,
					{ driverVersion },
				);
			}
			const contentType = response.headers.get("content-type") ?? "";
			if (!contentType.includes("application/json")) {
				throw new NonRetryableError(
					`ODSP file version ${versionId} snapshot did not honor the JSON accept header`,
					OdspErrorTypes.incorrectServerResponse,
					{ driverVersion, contentType, accept: authHeaders.accept },
				);
			}
			const snapshot = (await response.content.json()) as {
				readonly trees?: readonly [{ readonly sequenceNumber?: unknown }];
			};
			const sequenceNumber = snapshot.trees?.[0]?.sequenceNumber;
			if (
				typeof sequenceNumber !== "number" ||
				!Number.isInteger(sequenceNumber) ||
				sequenceNumber < 0
			) {
				throw new NonRetryableError(
					`ODSP file version ${versionId} snapshot has a missing or invalid sequenceNumber (${String(
						sequenceNumber,
					)})`,
					OdspErrorTypes.incorrectServerResponse,
					{ driverVersion, contentType, accept: authHeaders.accept },
				);
			}
			return sequenceNumber;
		});

	const validateLiveEpoch = async (): Promise<void> =>
		getWithRetryForTokenRefresh(async (options) => {
			const url = `${itemRoot}/opStream/snapshots/trees/latest?blobs=0`;
			const method = "GET";
			const token = await getAuthHeader(
				{ ...options, request: { url, method } },
				"LiveSnapshotEpoch",
			);
			const headers = mergeRequestHeaders(requestHeaders, getHeadersWithAuth(token));
			const response = await epochTracker.fetch(url, { method, headers }, "treesLatest");
			await response.content.arrayBuffer();
			if (response.headers.get("x-fluid-epoch") === null) {
				throw new NonRetryableError(
					"Cannot verify the selected ODSP file version lineage because the live response is missing an epoch.",
					OdspErrorTypes.incorrectServerResponse,
					{ driverVersion },
				);
			}
		});

	return { listFileVersions, resolveSequenceNumber, validateLiveEpoch };
}

/**
 * Creates the lightweight version selector used only by point-in-time loading.
 *
 * @remarks
 * Availability checks use the separate full version manager. Keeping this selector independent
 * prevents compact snapshot parsing and availability-only lineage logic from entering the loader
 * bundle.
 *
 * @internal
 */
export function createOdspPointInTimeVersionManager(
	props: OdspPointInTimeVersionManagerProps,
): PointInTimeVersionManager {
	return createOdspPointInTimeVersionManagerCore(createPointInTimeVersionFetcher(props));
}

/**
 * Creates the lightweight selector with an injected fetcher.
 *
 * @internal
 */
export function createOdspPointInTimeVersionManagerCore(
	fetcher: PointInTimeVersionFetcher,
): PointInTimeVersionManager {
	return {
		findBaseForSeq: async (target) => {
			const versions = await fetcher.listFileVersions();
			const result = await findBaseForSeqFromVersions(
				versions,
				target,
				fetcher.resolveSequenceNumber,
			);
			if (result.kind === "found") {
				// Read the live epoch after historical discovery so an exact-base load, which may not
				// request any live ops, still proves that the selected base is on the current lineage.
				await fetcher.validateLiveEpoch();
			}
			return result;
		},
	};
}
