/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { Deferred } from "@fluidframework/core-utils/internal";
import type { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import { restore, stub, useFakeTimers, type SinonFakeTimers, type SinonStub } from "sinon";

import { createOdspUrl } from "../createOdspUrl.js";
import { createOdspCacheAndTracker, EpochTracker } from "../epochTracker.js";
import { getFileLink } from "../getFileLink.js";
import { LocalPersistentCache, NonPersistentCache } from "../odspCache.js";
import { OdspDocumentStorageService } from "../odspDocumentStorageManager.js";
import { OdspDocumentService } from "../odspDocumentService.js";
import type { IOdspCache } from "../odspCache.js";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver.js";
import { RetryErrorsStorageAdapter } from "../retryErrorsStorageAdapter.js";
import { OdspOperation } from "../odspOperation.js";
import { withOdspOperation } from "../requestControl.js";
import { downloadSnapshot, fetchSnapshotWithRedeem } from "../fetchSnapshot.js";
// eslint-disable-next-line import-x/no-internal-modules
import { createOdspFileVersionFetcher } from "../odspVersionManager/odspFileVersionFetcher.js";

describe("ODSP operation telemetry", () => {
	let clock: SinonFakeTimers;
	let fetchStub: SinonStub<Parameters<typeof fetch>, ReturnType<typeof fetch>>;
	let logger: MockLogger;
	let storage: RetryErrorsStorageAdapter;
	let epochTracker: EpochTracker;
	let resolvedUrl: IOdspResolvedUrl;
	let cache: IOdspCache;
	let service: OdspDocumentStorageService;

	beforeEach(async () => {
		resolvedUrl = await new OdspDriverUrlResolver().resolve({
			url: createOdspUrl({
				siteUrl: "https://example.invalid",
				driveId: "drive",
				itemId: "item",
				dataStorePath: "/",
			}),
		});
		logger = new MockLogger();
		const result = createOdspCacheAndTracker(
			new LocalPersistentCache(),
			new NonPersistentCache(),
			{ docId: resolvedUrl.hashedDocumentId, resolvedUrl },
			logger.toTelemetryLogger(),
		);
		cache = result.cache;
		// Avoid redemption's independent loading barrier when exercising retryable storage errors.
		epochTracker = new EpochTracker(
			result.cache.persistedCache,
			{ docId: resolvedUrl.hashedDocumentId, resolvedUrl },
			logger.toTelemetryLogger(),
		);
		service = new OdspDocumentStorageService(
			resolvedUrl,
			async () => "******",
			logger.toTelemetryLogger(),
			true,
			result.cache,
			{},
			epochTracker,
			async () => ({}),
			() => undefined,
		);
		storage = new RetryErrorsStorageAdapter(service, logger.toTelemetryLogger());
		clock = useFakeTimers();
		fetchStub = stub(globalThis, "fetch").callsFake(
			async () =>
				new Response("blob", {
					headers: { "cache-control": "private", "x-fluid-epoch": "epoch" },
				}),
		);
	});

	afterEach(() => {
		storage.dispose();
		restore();
		clock.restore();
	});

	function events(name: string): MockLogger["events"] {
		return logger.events.filter((event) => event.eventName.endsWith(name));
	}

	it("keeps token retries in one operation while distinguishing parallel blob targets", async () => {
		fetchStub.onFirstCall().resolves(new Response("{}", { status: 401 }));
		await Promise.all([
			storage.readBlob("private-blob-A"),
			storage.readBlob("private-blob-B"),
		]);
		const starts = events("OdspRequestStart");
		const ends = events("OdspOperationEnd");
		assert.equal(starts.length, 3);
		assert.equal(ends.length, 2);
		assert.equal(starts[0].odspOperationId, starts[2].odspOperationId);
		assert.notEqual(starts[0].odspOperationId, starts[1].odspOperationId);
		assert.equal(starts[0].odspTargetId, starts[2].odspTargetId);
		assert.notEqual(starts[0].odspTargetId, starts[1].odspTargetId);
		assert.deepEqual(
			starts.map((event) => event.odspAttemptNumber),
			[1, 1, 2],
		);
		assert.equal(new Set(starts.map((event) => event.odspAttemptId)).size, 3);
		assert.equal(new Set(starts.map((event) => event.odspRequestId)).size, 3);
		assert.ok(starts.some((event) => Number(event.inFlightRequests) > 1));
		assert.ok(!JSON.stringify(starts).includes("private-blob"));
		assert.equal(events("OdspRequestEnd").length, 3);
		assert.equal(
			ends.reduce((count, event) => count + Number(event.httpAttempts), 0),
			3,
		);
		assert.ok(ends.every((event) => event.outcome === "succeeded"));
	});

	it("records scheduled and observed delay across coherency retries", async () => {
		fetchStub.onFirstCall().resolves(
			new Response("{}", {
				status: 409,
				headers: { "x-fluid-epoch": "epoch", "retry-after": "2" },
			}),
		);
		const read = storage.readBlob("private-blob-A");
		await clock.tickAsync(999);
		assert.equal(fetchStub.callCount, 1);
		await clock.tickAsync(1);
		await read;
		const requests = events("OdspRequestStart");
		assert.equal(requests.length, 2);
		assert.equal(requests[0].odspOperationId, requests[1].odspOperationId);
		assert.equal(requests[1].odspAttemptNumber, 2);
		const scheduled = events("OdspRetryScheduled")[0];
		const observed = events("OdspRetryWaitEnd")[0];
		assert.equal(scheduled?.scheduledDelayMs, 1000);
		assert.equal(scheduled?.serverRetryAfterMs, undefined);
		assert.equal(scheduled?.retryDelayMs, 1000);
		assert.equal(observed?.observedDelayMs, 1000);
		assert.equal(events("OdspOperationEnd").length, 1);
	});

	it("abandons a disposed storage retry promptly and makes no later HTTP attempt", async () => {
		fetchStub.onFirstCall().resolves(
			new Response("{}", {
				status: 409,
				headers: { "x-fluid-epoch": "epoch", "retry-after": "120" },
			}),
		);
		const read = assert.rejects(storage.readBlob("private-blob-A"), /disposed/i);
		await clock.tickAsync(500);
		storage.dispose();
		await read;
		await clock.tickAsync(120000);
		assert.equal(fetchStub.callCount, 1);
		const ends = events("OdspOperationEnd");
		assert.equal(ends.length, 1);
		assert.equal(ends[0].outcome, "abandoned");
		assert.equal(clock.countTimers(), 0);
	});

	it("reconstructs a 429 retry chain without counting coalesced or cached callers as HTTP attempts", async () => {
		fetchStub.onCall(0).resolves(
			new Response("{}", {
				status: 429,
				headers: { "retry-after": "120" },
			}),
		);
		fetchStub.onCall(1).resolves(
			new Response(
				JSON.stringify({
					webUrl: "https://example.invalid/file",
					webDavUrl: "https://example.invalid/file",
					sharepointIds: { siteUrl: resolvedUrl.siteUrl, listItemUniqueId: "item-guid" },
				}),
			),
		);
		fetchStub.onCall(2).resolves(
			new Response(
				JSON.stringify({
					d: { directUrl: "https://example.invalid/stable-link" },
				}),
			),
		);
		const getToken = async (): Promise<string> => "******";
		const first = getFileLink(getToken, resolvedUrl, logger.toTelemetryLogger());
		const coalesced = getFileLink(getToken, resolvedUrl, logger.toTelemetryLogger());
		await clock.tickAsync(59999);
		assert.equal(fetchStub.callCount, 1);
		await clock.tickAsync(1);
		await Promise.all([first, coalesced]);
		await getFileLink(getToken, resolvedUrl, logger.toTelemetryLogger());
		const requests = events("OdspRequestStart");
		assert.deepEqual(
			requests.map((event) => event.odspAttemptNumber),
			[1, 2, 3],
		);
		assert.equal(new Set(requests.map((event) => event.odspOperationId)).size, 1);
		assert.equal(events("OdspRetryScheduled")[0]?.serverRetryAfterMs, 120000);
		assert.equal(events("OdspRetryScheduled")[0]?.scheduledDelayMs, 60000);
		assert.equal(events("OdspRetryWaitEnd")[0]?.observedDelayMs, 60000);
		const ends = events("OdspOperationEnd");
		assert.equal(ends.length, 3);
		assert.deepEqual(ends.map((event) => event.httpAttempts).sort(), [0, 0, 3]);
		assert.equal(events("OdspRequestEnd").length, 3);
		assert.equal(events("OdspOperationCoalesced").length, 2);
	});

	it("distinguishes exhaustion from a non-retryable failure", async () => {
		fetchStub.callsFake(
			async () =>
				new Response("{}", {
					status: 409,
					headers: { "x-fluid-epoch": "epoch" },
				}),
		);
		const exhausted = assert.rejects(storage.readBlob("exhausted-blob"));
		await clock.runAllAsync();
		await exhausted;
		assert.equal(fetchStub.callCount, 5);
		fetchStub.callsFake(async () => new Response("{}", { status: 500 }));
		await assert.rejects(storage.readBlob("failed-blob"));
		assert.deepEqual(
			events("OdspOperationEnd").map((event) => event.outcome),
			["exhausted", "failed"],
		);
		assert.deepEqual(
			events("OdspOperationEnd").map((event) => event.httpAttempts),
			[5, 1],
		);
	});

	it("does not reuse a completed fallback operation when request options are reused", async () => {
		const options = {};
		await epochTracker.fetch("https://example.invalid/blob", options, "blob");
		await epochTracker.fetch("https://example.invalid/blob", options, "blob");
		const requests = events("OdspRequestStart");
		assert.equal(events("OdspOperationEnd").length, 2);
		assert.notEqual(requests[0].odspOperationId, requests[1].odspOperationId);
		assert.deepEqual(
			requests.map((event) => event.odspAttemptNumber),
			[1, 1],
		);
	});

	it("does not start a pending sibling request after its caller has already failed", async () => {
		const operation = new OdspOperation(
			logger.toTelemetryLogger(),
			epochTracker,
			"parallel",
			"document",
		);
		const pending = new Deferred<void>();
		const request = pending.promise.then(async () =>
			epochTracker.fetch(
				"https://example.invalid/blob",
				withOdspOperation({}, operation),
				"blob",
			),
		);
		await assert.rejects(
			operation.run(async () =>
				Promise.all([request, Promise.reject(new Error("sibling failed"))]),
			),
			/sibling failed/,
		);
		pending.resolve();
		await assert.rejects(request, /completed/i);
		assert.equal(fetchStub.callCount, 0);
		assert.equal(events("OdspOperationEnd").length, 1);
		assert.equal(events("OdspOperationEnd")[0].httpAttempts, 0);
	});

	it("does not construct a delta stream after disposal during lazy loading", async () => {
		const document = await OdspDocumentService.create(
			resolvedUrl,
			async () => "******",
			undefined,
			logger.toTelemetryLogger(),
			cache,
			{},
			epochTracker,
		);
		const connection = document.connectToDeltaStream({
			mode: "read",
			details: { capabilities: { interactive: true } },
			permission: [],
			user: { id: "id" },
			scopes: [],
		});
		document.dispose();
		await assert.rejects(connection, /disposed/i);
		assert.equal(fetchStub.callCount, 0);
		assert.equal(events("OdspOperationStart").length, 0);
		const replacement = await OdspDocumentService.create(
			resolvedUrl,
			async () => "******",
			undefined,
			logger.toTelemetryLogger(),
			cache,
			{},
			epochTracker,
		);
		replacement.dispose();
	});

	it("keeps direct storage token retries in one operation", async () => {
		fetchStub.onFirstCall().resolves(new Response("{}", { status: 401 }));
		await service.readBlob("direct-blob");
		const requests = events("OdspRequestStart");
		assert.equal(events("OdspOperationEnd").length, 1);
		assert.equal(requests[0].odspOperationId, requests[1].odspOperationId);
		assert.deepEqual(
			requests.map((event) => event.odspAttemptNumber),
			[1, 2],
		);
	});

	it("separates a background snapshot refresh from the caller that succeeds from cache", async () => {
		const pending = new Deferred<Response>();
		fetchStub.returns(pending.promise);
		stub(epochTracker, "get").resolves({
			snapshotTree: { id: "snapshot", blobs: {}, trees: { ".app": { blobs: {}, trees: {} } } },
			blobContents: new Map(),
			ops: [],
			sequenceNumber: 0,
			latestSequenceNumber: 0,
			snapshotFormatV: 1,
		});
		const concurrentService = new OdspDocumentStorageService(
			resolvedUrl,
			async () => "******",
			logger.toTelemetryLogger(),
			true,
			cache,
			{ concurrentSnapshotFetch: true },
			epochTracker,
			async () => ({}),
			() => undefined,
		);
		const concurrentStorage = new RetryErrorsStorageAdapter(
			concurrentService,
			logger.toTelemetryLogger(),
		);
		try {
			await concurrentStorage.getSnapshot();
			const caller = events("OdspOperationEnd")[0];
			assert.equal(caller.outcome, "succeeded");
			const background = events("OdspOperationStart").find(
				(event) => event.odspOperationKind === "refreshSnapshot",
			);
			assert.ok(background);
			assert.equal(background.odspParentOperationId, caller.odspOperationId);
			pending.resolve(new Response("{}", { status: 500 }));
			await clock.tickAsync(0);
			const requests = events("OdspRequestStart");
			assert.equal(requests.length, 1);
			assert.equal(requests[0].odspOperationId, background.odspOperationId);
			assert.deepEqual(
				events("OdspOperationEnd")
					.map((event) => event.httpAttempts)
					.sort(),
				[0, 1],
			);
			assert.equal(events("OdspOperationEnd")[1].outcome, "failed");
		} finally {
			concurrentStorage.dispose();
		}
	});

	it("carries a standalone snapshot operation through raw HTTP token retries", async () => {
		fetchStub.onCall(0).resolves(new Response("{}", { status: 401 }));
		fetchStub.onCall(1).resolves(
			new Response(
				JSON.stringify({
					id: "snapshot",
					trees: [{ id: "snapshot", entries: [], sequenceNumber: 1 }],
					blobs: [],
				}),
				{ headers: { "content-type": "application/json", "x-fluid-epoch": "epoch" } },
			),
		);
		await fetchSnapshotWithRedeem(
			resolvedUrl,
			async () => "******",
			undefined,
			logger.toTelemetryLogger(),
			async (url, token, options, groups, snapshotOptions, controller, operation) =>
				downloadSnapshot(
					url,
					token,
					options,
					groups,
					snapshotOptions,
					operation?.logger,
					undefined,
					controller,
					undefined,
					undefined,
					undefined,
					operation,
				),
			async () => {},
			async () => {},
			undefined,
		);
		const requests = events("OdspRequestStart");
		assert.equal(requests.length, 2);
		assert.equal(requests[0].odspOperationId, requests[1].odspOperationId);
		assert.deepEqual(
			requests.map((event) => event.odspAttemptNumber),
			[1, 2],
		);
		assert.equal(events("OdspOperationEnd").length, 1);
		assert.equal(events("OdspOperationEnd")[0].outcome, "succeeded");
		assert.equal(events("OdspOperationEnd")[0].httpAttempts, 2);
	});

	it("correlates version paging and epoch token retries without conflating targets", async () => {
		const versions = createOdspFileVersionFetcher({
			urlParts: resolvedUrl,
			getAuthHeader: async () => "******",
			epochTracker,
			logger: logger.toTelemetryLogger(),
		});
		fetchStub.onCall(0).resolves(new Response("{}", { status: 401 }));
		fetchStub.onCall(1).resolves(
			new Response(
				JSON.stringify({
					value: [{ id: "1.0", lastModifiedDateTime: "2025-01-01T00:00:00Z" }],
					"@odata.nextLink": "https://example.invalid/next-page",
				}),
			),
		);
		fetchStub.onCall(2).resolves(new Response(JSON.stringify({ value: [] })));
		await versions.listFileVersions();
		fetchStub.onCall(3).resolves(new Response("{}", { status: 401 }));
		await versions.getLiveDocumentEpoch();
		await versions.getRecoverableVersionEpoch("private-version");
		const requests = events("OdspRequestStart");
		assert.deepEqual(
			requests.map((event) => event.odspAttemptNumber),
			[1, 2, 3, 1, 2, 1],
		);
		assert.equal(new Set(requests.slice(0, 3).map((event) => event.odspOperationId)).size, 1);
		assert.equal(requests[3].odspOperationId, requests[4].odspOperationId);
		assert.notEqual(requests[4].odspTargetId, requests[5].odspTargetId);
		assert.equal(events("OdspOperationEnd").length, 3);
		assert.ok(!JSON.stringify(requests).includes("private-version"));
	});
});
