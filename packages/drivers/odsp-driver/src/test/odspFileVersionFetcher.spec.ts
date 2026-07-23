/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	ISequencedDocumentMessage,
	ISnapshot,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";
import type {
	IOdspResolvedUrl,
	IOdspUrlParts,
	InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import { stub } from "sinon";

import { convertToCompactSnapshot } from "../compactSnapshotWriter.js";
import type { IOdspSnapshot } from "../contracts.js";
import { EpochTracker } from "../epochTracker.js";
import { LocalPersistentCache } from "../odspCache.js";
import { getHashedDocumentId } from "../odspPublicUtils.js";
// eslint-disable-next-line import-x/no-internal-modules
import { createOdspFileVersionFetcher } from "../odspVersionManager/odspFileVersionFetcher.js";

import { createResponse, type MockResponse, notFound } from "./mockFetch.js";

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

	/**
	 * An ODSP JSON snapshot carrying a tree sequence number plus embedded op stream (its
	 * `snapshotOps`), modeling the ops a live snapshot bundles when fetched with `deltas=1`.
	 */
	function snapshotWithOps(
		treeSequenceNumber: number,
		opSequenceNumbers: number[],
	): IOdspSnapshot {
		return {
			...snapshotWithSeq(treeSequenceNumber),
			ops: opSequenceNumbers.map((sequenceNumber) => ({
				sequenceNumber,
				op: { sequenceNumber } as unknown as ISequencedDocumentMessage,
			})),
		};
	}

	/** A snapshot missing its sequence number (models a malformed response). */
	const snapshotMissingSeq = {
		id: "id",
		trees: [{ entries: [{ path: "path", type: "tree" }], id: "id" }],
		blobs: [],
	} as unknown as IOdspSnapshot;

	const msFluidHeaders = { "content-type": "application/ms-fluid" };

	/** Serialize a minimal snapshot carrying `sequenceNumber` into the compact (ms-fluid) binary form. */
	function compactSnapshotBytesWithSeq(sequenceNumber: number): Uint8Array {
		const snapshotTree: ISnapshotTree = { id: "id", blobs: {}, trees: {} };
		const snapshot: ISnapshot = {
			snapshotTree,
			blobContents: new Map(),
			ops: [],
			sequenceNumber,
			latestSequenceNumber: sequenceNumber,
			snapshotFormatV: 1,
		};
		return convertToCompactSnapshot(snapshot);
	}

	it("listFileVersions parses the /versions response and calls the versions URL", async () => {
		// @q F-LIST-01
		const { result, urls } = await withFetch(
			[
				await createResponse(
					jsonHeaders,
					{
						value: [
							{ id: "42.0", lastModifiedDateTime: "2026-01-02T00:00:00Z" },
							{ id: "40.0", lastModifiedDateTime: "2026-01-01T00:00:00Z" },
						],
					},
					200,
				),
			],
			async () => fetcher.listFileVersions(),
		);

		assert.deepEqual(
			result.map((v) => [v.versionId, v.lastModifiedDateTime]),
			[
				["42.0", "2026-01-02T00:00:00Z"],
				["40.0", "2026-01-01T00:00:00Z"],
			],
		);
		assert.ok(
			urls[0]?.includes(`/_api/v2.1/drives/${driveId}/items/${itemId}/versions`),
			`expected the versions URL, got ${urls[0]}`,
		);
	});

	it("follows @odata.nextLink to include versions past the first page", async () => {
		// @q F-LIST-02
		const nextLink = "https://microsoft.sharepoint.com/_api/v2.1/versions?page=2";
		const { result, urls } = await withFetch(
			[
				await createResponse(
					jsonHeaders,
					{
						value: [{ id: "42.0", lastModifiedDateTime: "2026-01-03T00:00:00Z" }],
						"@odata.nextLink": nextLink,
					},
					200,
				),
				await createResponse(
					jsonHeaders,
					{ value: [{ id: "41.0", lastModifiedDateTime: "2026-01-02T00:00:00Z" }] },
					200,
				),
			],
			async () => fetcher.listFileVersions(),
		);

		assert.deepEqual(
			result.map((v) => v.versionId),
			["42.0", "41.0"],
			"versions from both pages should be included, newest-first",
		);
		assert.equal(urls.length, 2, "should follow the nextLink for a second page");
		assert.equal(urls[1], nextLink, "the second request should target the nextLink URL");
	});

	it("returns an empty list when the response has no value field", async () => {
		// @q F-LIST-03
		const { result } = await withFetch(
			[await createResponse(jsonHeaders, {}, 200)],
			async () => fetcher.listFileVersions(),
		);
		assert.deepEqual(result, [], "a missing value field is treated as an empty version list");
	});

	it("resolveSequenceNumber reads trees[0].sequenceNumber and calls the versioned snapshot URL", async () => {
		// @q F-RESOLVE-01
		const { result, urls } = await withFetch(
			[await createResponse(jsonHeaders, snapshotWithSeq(448), 200)],
			async () => fetcher.resolveSequenceNumber("42.0"),
		);

		assert.equal(result, 448);
		assert.ok(
			urls[0]?.includes(`/versions/42.0/opStream/snapshots/trees/latest?blobs=2`),
			`expected the fileVersion snapshot URL, got ${urls[0]}`,
		);
	});

	it("resolveSequenceNumber throws (does not return a wrong value) when the snapshot has no sequence number", async () => {
		// @q F-RESOLVE-02
		await assert.rejects(
			async () =>
				withFetch([await createResponse(jsonHeaders, snapshotMissingSeq, 200)], async () =>
					fetcher.resolveSequenceNumber("42.0"),
				),
			/42\.0/,
		);
	});

	it("resolveSequenceNumber parses an application/ms-fluid (binary) snapshot", async () => {
		// @q F-RESOLVE-03
		const { result } = await withFetch(
			[await createResponse(msFluidHeaders, compactSnapshotBytesWithSeq(448), 200)],
			async () => fetcher.resolveSequenceNumber("42.0"),
		);
		assert.equal(result, 448);
	});

	it("listFileVersions surfaces a non-success response as an error", async () => {
		// @q F-ERROR-01
		await assert.rejects(async () =>
			withFetch([await notFound()], async () => fetcher.listFileVersions()),
		);
	});

	it("resolveSequenceNumber refreshes the token and retries after an auth failure", async () => {
		// @q F-ERROR-02
		const refreshFlags: boolean[] = [];
		const trackingAuth: InstrumentedStorageTokenFetcher = async (options) => {
			refreshFlags.push(options.refresh);
			return "******";
		};
		const authRetryFetcher = createOdspFileVersionFetcher({
			urlParts,
			getAuthHeader: trackingAuth,
			epochTracker,
			logger,
		});
		const { result } = await withFetch(
			[
				await createResponse(jsonHeaders, undefined, 401), // auth failure -> triggers a token refresh
				await createResponse(jsonHeaders, snapshotWithSeq(448), 200), // retry succeeds
			],
			async () => authRetryFetcher.resolveSequenceNumber("42.0"),
		);
		assert.equal(result, 448);
		assert.deepEqual(
			refreshFlags,
			[false, true],
			"the first attempt uses a cached token; the retry forces a refresh",
		);
	});

	it("resolveSequenceNumber surfaces a non-success response as an error", async () => {
		// @q F-ERROR-03
		await assert.rejects(async () =>
			withFetch([await notFound()], async () => fetcher.resolveSequenceNumber("42.0")),
		);
	});

	const epochHeaders = (epoch: string): { [key: string]: string } => ({
		...jsonHeaders,
		"x-fluid-epoch": epoch,
	});

	it("getLiveDocumentEpoch reads x-fluid-epoch from the live snapshot endpoint", async () => {
		// @q F-EPOCH-01
		const { result, urls } = await withFetch(
			[await createResponse(epochHeaders("epoch-live"), new Uint8Array(0), 200)],
			async () => fetcher.getLiveDocumentEpoch(),
		);
		assert.equal(result, "epoch-live");
		assert.ok(
			urls[0]?.includes(`/drives/${driveId}/items/${itemId}/opStream/snapshots/trees/latest`),
			`expected the live snapshot URL, got ${urls[0]}`,
		);
		assert.ok(
			!urls[0]?.includes("/versions/"),
			"the live epoch must not be read from a versioned URL",
		);
	});

	it("getRecoverableVersionEpoch reads x-fluid-epoch from the versioned snapshot endpoint", async () => {
		// @q F-EPOCH-02
		const { result, urls } = await withFetch(
			[await createResponse(epochHeaders("epoch-old"), new Uint8Array(0), 200)],
			async () => fetcher.getRecoverableVersionEpoch("40.0"),
		);
		assert.equal(result, "epoch-old");
		assert.ok(
			urls[0]?.includes(`/versions/40.0/opStream/snapshots/trees/latest`),
			`expected the versioned snapshot URL, got ${urls[0]}`,
		);
	});

	it("getRecoverableVersionEpoch returns undefined when the server sends no epoch header", async () => {
		// @q F-EPOCH-03
		const { result } = await withFetch(
			[await createResponse(jsonHeaders, new Uint8Array(0), 200)],
			async () => fetcher.getRecoverableVersionEpoch("40.0"),
		);
		assert.equal(result, undefined);
	});

	it("fetchOps returns the sequence numbers the server retains in the requested range", async () => {
		// @q F-OPS-01
		const { result, urls } = await withFetch(
			[
				await createResponse(
					epochHeaders("epoch-live"),
					{
						value: [{ sequenceNumber: 419 }, { sequenceNumber: 420 }, { sequenceNumber: 421 }],
					},
					200,
				),
				// The live snapshot is consulted for embedded snapshotOps; here they overlap the feed
				// (and 422 is out of the requested [419, 422) range), so the merged result is unchanged.
				await createResponse(epochHeaders("epoch-live"), snapshotWithOps(0, [420, 421, 422]), 200),
			],
			async () => fetcher.fetchOps(419, 422),
		);
		assert.deepEqual(result, [419, 420, 421]);
		assert.ok(
			urls[0]?.includes(`/drives/${driveId}/items/${itemId}/opStream`),
			`expected the live delta feed URL, got ${urls[0]}`,
		);
		assert.ok(
			urls[0]?.includes("sequenceNumber%20ge%20419") &&
				urls[0]?.includes("sequenceNumber%20le%20421"),
			`expected the [419, 421] filter, got ${urls[0]}`,
		);
		assert.ok(
			urls[1]?.includes(
				`/drives/${driveId}/items/${itemId}/opStream/snapshots/trees/latest?deltas=1&blobs=2`,
			),
			`expected the live snapshot (deltas=1) URL, got ${urls[1]}`,
		);
	});

	it("fetchOps merges live snapshot ops the delta feed no longer serves", async () => {
		// @q F-OPS-02
		// A freshly created document's early ops live only in the creation snapshot and are absent
		// from the queryable delta feed. fetchOps must surface them so op-availability validation does
		// not falsely reject a base whose ops a load can still replay from the snapshot.
		const { result } = await withFetch(
			[
				// The delta feed has a gap: 421 is missing.
				await createResponse(
					epochHeaders("epoch-live"),
					{ value: [{ sequenceNumber: 419 }, { sequenceNumber: 420 }, { sequenceNumber: 422 }] },
					200,
				),
				// The live snapshot still carries the missing op (and 423, which is out of range).
				await createResponse(epochHeaders("epoch-live"), snapshotWithOps(0, [421, 423]), 200),
			],
			async () => fetcher.fetchOps(419, 423),
		);
		assert.deepEqual(result, [419, 420, 421, 422]);
	});

	it("listFileVersions refreshes the token and retries after an auth failure", async () => {
		// @q F-ERROR-04
		const refreshFlags: boolean[] = [];
		const trackingAuth: InstrumentedStorageTokenFetcher = async (options) => {
			refreshFlags.push(options.refresh);
			return "******";
		};
		const authRetryFetcher = createOdspFileVersionFetcher({
			urlParts,
			getAuthHeader: trackingAuth,
			epochTracker,
			logger,
		});
		const { result } = await withFetch(
			[
				await createResponse(jsonHeaders, undefined, 401), // auth failure -> triggers a token refresh
				await createResponse(
					jsonHeaders,
					{ value: [{ id: "42.0", lastModifiedDateTime: "2026-01-02T00:00:00Z" }] },
					200,
				), // retry succeeds
			],
			async () => authRetryFetcher.listFileVersions(),
		);
		assert.deepEqual(
			result.map((v) => v.versionId),
			["42.0"],
		);
		assert.deepEqual(
			refreshFlags,
			[false, true],
			"the first attempt uses a cached token; the retry forces a refresh",
		);
	});
});
