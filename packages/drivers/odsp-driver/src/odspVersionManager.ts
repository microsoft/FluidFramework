/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import type {
	IDocumentAttributes,
	ISnapshot,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";
import { NonRetryableError } from "@fluidframework/driver-utils/internal";
import {
	type IOdspResolvedUrl,
	type InstrumentedStorageTokenFetcher,
	OdspErrorTypes,
} from "@fluidframework/odsp-driver-definitions/internal";
import {
	PerformanceEvent,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import type { EpochTracker } from "./epochTracker.js";
import { fetchSnapshot } from "./fetchSnapshot.js";
import { getHeadersWithAuth } from "./getUrlAndHeadersWithAuth.js";
import {
	type IOdspResponse,
	getWithRetryForTokenRefresh,
	type TokenFetchOptionsEx,
} from "./odspUtils.js";
import { getApiRoot } from "./odspUrlHelper.js";
import { pkgVersion as driverVersion } from "./packageVersion.js";

interface OdspFileVersion {
	readonly id: string;
}

interface OdspFileVersionsResponse {
	readonly value?: OdspFileVersion[];
}

export interface HistoricalSnapshotCandidate {
	readonly fileVersionId: string;
	readonly sequenceNumber: number;
	readonly snapshotTree: ISnapshotTree;
}

export interface HistoricalSnapshotSearchResult {
	readonly candidate?: HistoricalSnapshotCandidate;
	readonly candidates?: HistoricalSnapshotCandidate[];
	readonly versionsScanned: number;
	readonly candidateSnapshotReads: number;
}

function getAttributesBlobId(snapshotTree: ISnapshotTree): string | undefined {
	return (
		snapshotTree.trees[".protocol"]?.blobs.attributes ?? snapshotTree.blobs[".attributes"]
	);
}

function getOdspFileVersionUrlBase(
	odspResolvedUrl: IOdspResolvedUrl,
	fileVersionId: string,
): string {
	const { driveId, itemId, siteUrl } = odspResolvedUrl;
	const version = `versions/${encodeURIComponent(fileVersionId)}/`;
	return `${getApiRoot(new URL(siteUrl))}/drives/${driveId}/items/${itemId}/${version}`;
}

export function getOdspFileVersionsUrl(
	odspResolvedUrl: Pick<IOdspResolvedUrl, "driveId" | "itemId" | "siteUrl">,
): string {
	const { driveId, itemId, siteUrl } = odspResolvedUrl;
	return `${getApiRoot(new URL(siteUrl))}/drives/${driveId}/items/${itemId}/versions`;
}

function getOdspFileVersionSnapshotUrl(
	odspResolvedUrl: IOdspResolvedUrl,
	fileVersionId: string,
): string {
	return `${getOdspFileVersionUrlBase(odspResolvedUrl, fileVersionId)}opStream/snapshots`;
}

function getOdspFileVersionAttachmentGETUrl(
	odspResolvedUrl: IOdspResolvedUrl,
	fileVersionId: string,
): string {
	return `${getOdspFileVersionUrlBase(odspResolvedUrl, fileVersionId)}opStream/attachments`;
}

function getOdspFileVersionDeltaStorageUrl(
	odspResolvedUrl: IOdspResolvedUrl,
	fileVersionId: string,
): string {
	return `${getOdspFileVersionUrlBase(odspResolvedUrl, fileVersionId)}opStream`;
}

export class OdspVersionManager {
	public constructor(
		private readonly odspResolvedUrl: IOdspResolvedUrl,
		private readonly getAuthHeader: InstrumentedStorageTokenFetcher,
		private readonly logger: TelemetryLoggerExt,
		private readonly epochTracker: EpochTracker,
	) {}

	public async findClosestSnapshotAtOrBefore(
		targetSequenceNumber: number,
		scenarioName: string | undefined,
	): Promise<HistoricalSnapshotSearchResult> {
		const searchResult = await this.findSnapshotsAtOrBefore(
			targetSequenceNumber,
			scenarioName,
		);
		return {
			...searchResult,
			candidate: searchResult.candidates[0],
		};
	}

	public async findSnapshotsAtOrBefore(
		targetSequenceNumber: number,
		scenarioName: string | undefined,
	): Promise<Required<Omit<HistoricalSnapshotSearchResult, "candidate">>> {
		const versions = await this.getOdspFileVersions(scenarioName);
		let versionsScanned = 0;
		let candidateSnapshotReads = 0;
		const candidates: HistoricalSnapshotCandidate[] = [];
		for (const version of versions) {
			versionsScanned++;
			candidateSnapshotReads++;
			const snapshot = await this.fetchSnapshotFromVersion(version.id, false, scenarioName);
			const { snapshotTree } = snapshot;

			const sequenceNumber = await this.getSnapshotSequenceNumber(
				snapshotTree,
				version.id,
				scenarioName,
			);
			if (sequenceNumber <= targetSequenceNumber) {
				candidates.push({ fileVersionId: version.id, sequenceNumber, snapshotTree });
			}
		}

		candidates.sort((left, right) => right.sequenceNumber - left.sequenceNumber);

		return { candidates, versionsScanned, candidateSnapshotReads };
	}

	public async fetchSnapshotFromVersion(
		fileVersionId: string,
		fetchFullSnapshot: boolean,
		scenarioName: string | undefined,
	): Promise<ISnapshot> {
		return getWithRetryForTokenRefresh(async (options) => {
			const snapshotDownloader = async (url: string): Promise<IOdspResponse<unknown>> => {
				const authHeader = await this.getAuthHeader(
					{ ...options, request: { url, method: "GET" } },
					"ReadHistoricalSnapshot",
				);
				const headers = getHeadersWithAuth(authHeader);
				return this.epochTracker.fetchAndParseAsJSON(
					url,
					{ headers },
					"snapshotTree",
					undefined,
					scenarioName,
				);
			};

			return fetchSnapshot(
				getOdspFileVersionSnapshotUrl(this.odspResolvedUrl, fileVersionId),
				"latest",
				fetchFullSnapshot,
				this.logger,
				snapshotDownloader,
			);
		});
	}

	public getDeltaStorageUrlForVersion(fileVersionId: string): string {
		return getOdspFileVersionDeltaStorageUrl(this.odspResolvedUrl, fileVersionId);
	}

	private async getSnapshotSequenceNumber(
		snapshotTree: ISnapshotTree,
		fileVersionId: string,
		scenarioName: string | undefined,
	): Promise<number> {
		const attributesBlobId = getAttributesBlobId(snapshotTree);
		if (attributesBlobId === undefined) {
			throw new NonRetryableError(
				"Historical snapshot candidate does not contain document attributes",
				OdspErrorTypes.incorrectServerResponse,
				{ driverVersion },
			);
		}

		const attributesBuffer = await this.readBlobFromVersion(
			fileVersionId,
			attributesBlobId,
			scenarioName,
		);
		const attributes = JSON.parse(
			bufferToString(attributesBuffer, "utf8"),
		) as IDocumentAttributes;
		return attributes.sequenceNumber;
	}

	private async readBlobFromVersion(
		fileVersionId: string,
		blobId: string,
		scenarioName: string | undefined,
	): Promise<ArrayBuffer> {
		return getWithRetryForTokenRefresh(async (options) => {
			const attachmentGETUrl = getOdspFileVersionAttachmentGETUrl(
				this.odspResolvedUrl,
				fileVersionId,
			);
			const url = `${attachmentGETUrl}/${encodeURIComponent(blobId)}/content`;
			const method = "GET";
			const authHeader = await this.getAuthHeader(
				{ ...options, request: { url, method } },
				"GetHistoricalBlob",
			);
			const headers = getHeadersWithAuth(authHeader);

			return PerformanceEvent.timedExecAsync(
				this.logger,
				{
					eventName: "readHistoricalDataBlob",
					blobId,
					fileVersionId,
				},
				async (event) => {
					const res = await this.epochTracker.fetchArray(
						url,
						{ headers },
						"blob",
						undefined,
						scenarioName,
					);
					event.end({
						...res.propsToLog,
						attempts: options.refresh ? 2 : 1,
					});
					return res.content;
				},
			);
		});
	}

	private async getOdspFileVersions(
		scenarioName: string | undefined,
	): Promise<OdspFileVersion[]> {
		return getWithRetryForTokenRefresh(async (options: TokenFetchOptionsEx) => {
			const url = getOdspFileVersionsUrl(this.odspResolvedUrl);
			const method = "GET";
			const storageToken = await this.getAuthHeader(
				{ ...options, request: { url, method } },
				"GetFileVersionHistory",
			);
			const headers = getHeadersWithAuth(storageToken);

			const response = await PerformanceEvent.timedExecAsync(
				this.logger,
				{
					eventName: "GetFileVersionHistory",
				},
				async () =>
					this.epochTracker.fetchAndParseAsJSON<OdspFileVersionsResponse>(
						url,
						{ headers, method },
						"versions",
						undefined,
						scenarioName,
					),
			);
			const versionsResponse = response.content;
			if (versionsResponse === undefined) {
				throw new NonRetryableError(
					"No response from ODSP file versions endpoint",
					OdspErrorTypes.genericNetworkError,
					{ driverVersion },
				);
			}
			if (!Array.isArray(versionsResponse.value)) {
				throw new NonRetryableError(
					"Incorrect response from ODSP file versions endpoint, expected an array",
					OdspErrorTypes.genericNetworkError,
					{ driverVersion },
				);
			}

			return versionsResponse.value;
		});
	}
}
