/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IOdspResolvedUrl,
	IOdspUrlParts,
	InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import { stub } from "sinon";

import type { IOdspSnapshot } from "../contracts.js";
import { EpochTracker } from "../epochTracker.js";
import { LocalPersistentCache } from "../odspCache.js";
import { getHashedDocumentId } from "../odspPublicUtils.js";
import { createOdspFileVersionFetcher } from "../odspVersionManager/index.js";

import { createResponse, type MockResponse } from "./mockFetch.js";

/**
 * Integration tests for `createOdspFileVersionFetcher`. These exercise the real code path — URL
 * construction, `getAuthHeader`, `EpochTracker.fetch`, content-type branching, and the driver's
 * snapshot parser — against a stubbed `globalThis.fetch` (no live ODSP server).
 */
describe("OdspFileVersionFetcher (integration, stubbed fetch)", () => {
	const siteUrl = "https://microsoft.sharepoint.com";
	const driveId = "driveId";
	const itemId = "itemId";
	const urlParts: IOdspUrlParts = { siteUrl, driveId, itemId };

	// getAuthHeader is stubbed to a fixed token; getHeadersWithAuth turns it into the Authorization header.
	const getAuthHeader: InstrumentedStorageTokenFetcher = async () => "Bearer token";
	const logger = createChildLogger();

	let epochTracker: EpochTracker;
	let fetcher: ReturnType<typeof createOdspFileVersionFetcher>;

	beforeEach(async () => {
		const hashedDocumentId = await getHashedDocumentId(driveId, itemId);
		const resolvedUrl = {
			siteUrl,
			driveId,
			itemId,
			odspResolvedUrl: true,
		} as unknown as IOdspResolvedUrl;
		epochTracker = new EpochTracker(
			new LocalPersistentCache(),
			{ docId: hashedDocumentId, resolvedUrl },
			createChildLogger(),
		);
		fetcher = createOdspFileVersionFetcher({ urlParts, getAuthHeader, epochTracker, logger });
	});

	afterEach(async () => {
		await epochTracker.removeEntries().catch(() => {});
	});

	/**
	 * Run `fn` with `globalThis.fetch` stubbed to return `responses` in order, capturing the requested
	 * URLs so tests can assert URL construction.
	 */
	async function withFetch<T>(
		responses: MockResponse[],
		fn: () => Promise<T>,
	): Promise<{ result: T; urls: string[] }> {
		const urls: string[] = [];
		const fetchStub = stub(globalThis, "fetch");
		fetchStub.callsFake(async (url) => {
			urls.push(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
			const next = responses.shift();
			assert(next !== undefined, "unexpected extra fetch call");
			return next as unknown as Response;
		});
		try {
			const result = await fn();
			assert.equal(responses.length, 0, "all stubbed responses should be consumed");
			return { result, urls };
		} finally {
			fetchStub.restore();
		}
	}

	const jsonHeaders = { "content-type": "application/json" };

	/** A minimal but parser-valid ODSP JSON snapshot carrying the given sequence number. */
	function snapshotWithSeq(sequenceNumber: number): IOdspSnapshot {
		return {
			id: "id",
			trees: [{ entries: [{ path: "path", type: "tree" }], id: "id", sequenceNumber }],
			blobs: [],
		};
	}

	/** A snapshot missing its sequence number (models a malformed response). */
	const snapshotMissingSeq = {
		id: "id",
		trees: [{ entries: [{ path: "path", type: "tree" }], id: "id" }],
		blobs: [],
	} as unknown as IOdspSnapshot;

	it("listFileVersions parses the /versions response and calls the versions URL", async () => {
		// @q F-LIST-01
		const { result, urls } = await withFetch(
			[
				await createResponse(
					jsonHeaders,
					{
						value: [
							{ id: "42.0", lastModifiedDateTime: "2026-01-02T00:00:00Z", size: 111 },
							{ id: "40.0", lastModifiedDateTime: "2026-01-01T00:00:00Z", size: 222 },
						],
					},
					200,
				),
			],
			async () => fetcher.listFileVersions(),
		);

		assert.deepEqual(
			result.map((v) => [v.versionId, v.sizeBytes]),
			[
				["42.0", 111],
				["40.0", 222],
			],
		);
		assert.ok(
			urls[0]?.includes(`/_api/v2.1/drives/${driveId}/items/${itemId}/versions`),
			`expected the versions URL, got ${urls[0]}`,
		);
	});

	it("resolveSequenceNumber reads trees[0].sequenceNumber and calls the versioned snapshot URL", async () => {
		// @q F-RESOLVE-01
		const { result, urls } = await withFetch(
			[await createResponse(jsonHeaders, snapshotWithSeq(448), 200)],
			async () => fetcher.resolveSequenceNumber("42.0"),
		);

		assert.equal(result, 448);
		assert.ok(
			urls[0]?.includes(
				`/versions/42.0/opStream/snapshots/trees/latest?blobs=2`,
			),
			`expected the fileVersion snapshot URL, got ${urls[0]}`,
		);
	});

	it("resolveSequenceNumber throws (does not return a wrong value) when the snapshot has no sequence number", async () => {
		// @q F-RESOLVE-02
		await assert.rejects(
			async () =>
				withFetch(
					[await createResponse(jsonHeaders, snapshotMissingSeq, 200)],
					async () => fetcher.resolveSequenceNumber("42.0"),
				),
			/42\.0/,
		);
	});
});
