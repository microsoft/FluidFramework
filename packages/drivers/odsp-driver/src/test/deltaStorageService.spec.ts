/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { fromUtf8ToBase64 } from "@fluid-internal/client-utils";
import type {
	IDeltasFetchResult,
	IFileEntry,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import type {
	IOdspResolvedUrl,
	InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import type { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/legacy";
import { type SinonStub, stub } from "sinon";

import { EpochTracker } from "../epochTracker.js";
import { LocalPersistentCache } from "../odspCache.js";
import {
	OdspDeltaStorageService,
	OdspDeltaStorageWithCache,
} from "../odspDeltaStorageService.js";
import type { OdspDocumentStorageService } from "../odspDocumentStorageManager.js";

import { mockFetchOk } from "./mockFetch.js";

const createUtLocalCache = (): LocalPersistentCache => new LocalPersistentCache(2000);
const createUtEpochTracker = (
	fileEntry: IFileEntry,
	logger: ITelemetryLoggerExt,
): EpochTracker => new EpochTracker(createUtLocalCache(), fileEntry, logger);

describe("DeltaStorageService", () => {
	/*
	 * Use fake urls so we don't accidental make real calls that make our tests flakey.
	 * Using microsoft.com as the domain so we don't send traffic somewhere hostile on accident.
	 */
	const deltaStorageBasePath = "https://fake.microsoft.com";
	const deltaStorageRelativePath = "/drives/testdrive/items/testitem/opStream";
	const testDeltaStorageUrl = `${deltaStorageBasePath}${deltaStorageRelativePath}`;
	const siteUrl = "https://fake.microsoft.com";
	const driveId = "testdrive";
	const itemId = "testitem";
	const resolvedUrl = {
		siteUrl,
		driveId,
		itemId,
		odspResolvedUrl: true,
	} as unknown as IOdspResolvedUrl;
	const fileEntry = { docId: "docId", resolvedUrl };

	describe("Request-bound authorization", () => {
		let epochTracker: EpochTracker;
		let deltaStorageService: OdspDeltaStorageService;
		let fetchStub: SinonStub<Parameters<typeof fetch>, ReturnType<typeof fetch>>;
		let getAuthHeader: SinonStub<
			Parameters<InstrumentedStorageTokenFetcher>,
			ReturnType<InstrumentedStorageTokenFetcher>
		>;

		beforeEach(() => {
			const logger = new MockLogger().toTelemetryLogger();
			epochTracker = createUtEpochTracker(fileEntry, logger);
			epochTracker.setEpoch("epoch1", true, "test");
			fetchStub = stub(globalThis, "fetch").callsFake(
				async () =>
					new Response(JSON.stringify({ value: [] }), {
						headers: { "x-fluid-epoch": "epoch1" },
					}),
			);
			getAuthHeader = stub<
				Parameters<InstrumentedStorageTokenFetcher>,
				ReturnType<InstrumentedStorageTokenFetcher>
			>().callsFake(async (options) => {
				assert(options.request !== undefined);
				return `MSAuth1.0 popToken="${options.request.method} ${options.request.url}", type="AT_POP"`;
			});
			deltaStorageService = new OdspDeltaStorageService(
				testDeltaStorageUrl,
				getAuthHeader,
				epochTracker,
				logger,
			);
		});

		afterEach(async () => {
			fetchStub.restore();
			await epochTracker.removeEntries();
		});

		for (const useBearer of [false, true]) {
			it(`authorizes the multipart GET once with bearer authorization ${useBearer}`, async () => {
				if (useBearer) {
					getAuthHeader.resolves("Bearer storage-token");
				}
				await deltaStorageService.get(3, 8, {}, "ops-test");

				assert(fetchStub.calledOnce);
				assert(getAuthHeader.calledOnce);
				const [url, options] = fetchStub.firstCall.args;
				assert(typeof url === "string" && options !== undefined);
				assert.deepEqual(getAuthHeader.firstCall.args[0], {
					refresh: false,
					request: { url, method: "GET" },
				});
				assert.equal(url, deltaStorageService.buildUrl(3, 8));
				assert.equal(options.method, "POST");
				const headers = new Headers(options.headers);
				assert.equal(headers.has("authorization"), false);
				assert.match(headers.get("content-type") ?? "", /^multipart\/form-data;boundary=/);
				assert(typeof options.body === "string");
				const authHeader = useBearer
					? "Bearer storage-token"
					: `MSAuth1.0 popToken="GET ${url}", type="AT_POP"`;
				for (const entry of [
					`Authorization: ${authHeader}`,
					"X-HTTP-Method-Override: GET",
					"_post: 1",
					"x-fluid-epoch: epoch1",
					"ops-test",
				]) {
					assert(options.body.includes(entry), `Multipart body should contain ${entry}`);
				}
			});
		}

		it("refreshes GET-bound authorization only once on a claims challenge", async () => {
			const claims = '{"access_token":{"auth_time":{"essential":true}}}';
			const tenantId = "test-tenant";
			fetchStub.onFirstCall().resolves(
				new Response(undefined, {
					status: 401,
					headers: {
						"www-authenticate": `Bearer realm="${tenantId}", error="insufficient_claims", claims="${fromUtf8ToBase64(claims)}"`,
					},
				}),
			);

			await deltaStorageService.get(3, 8, {});

			assert(fetchStub.calledTwice);
			assert(getAuthHeader.calledTwice);
			assert.equal(getAuthHeader.firstCall.args[0].refresh, false);
			assert.equal(getAuthHeader.secondCall.args[0].refresh, true);
			assert.equal(getAuthHeader.secondCall.args[0].claims, claims);
			assert.equal(getAuthHeader.secondCall.args[0].tenantId, tenantId);
			for (const [index, call] of getAuthHeader.getCalls().entries()) {
				const [url, options] = fetchStub.getCall(index).args;
				assert(typeof url === "string" && options !== undefined);
				assert.deepEqual(call.args[0].request, { url, method: "GET" });
				assert.equal(options.method, "POST");
				assert.equal(new URL(url).searchParams.get("ump"), "1");
				assert(typeof options.body === "string");
				assert(
					options.body.includes(
						`Authorization: MSAuth1.0 popToken="GET ${url}", type="AT_POP"`,
					),
				);
			}
		});

		it("does not send a request if authorization fails", async () => {
			const error = new Error("Could not authorize the ops GET");
			getAuthHeader.rejects(error);

			await assert.rejects(
				deltaStorageService.get(3, 8, {}),
				(candidate: unknown) => candidate === error,
			);

			assert(getAuthHeader.calledOnce);
			assert(fetchStub.notCalled);
		});
	});

	it("Should build the correct sharepoint delta url with auth", async () => {
		const loggerMock = new MockLogger();
		const logger = loggerMock.toTelemetryLogger();
		const deltaStorageService = new OdspDeltaStorageService(
			testDeltaStorageUrl,
			async (_refresh) => "?access_token=123",
			createUtEpochTracker(fileEntry, logger),
			logger,
		);
		const actualDeltaUrl = deltaStorageService.buildUrl(3, 8);
		const expectedDeltaUrl = `${deltaStorageBasePath}/drives/testdrive/items/testitem/opStream?ump=1&filter=sequenceNumber%20ge%203%20and%20sequenceNumber%20le%207`;
		assert.equal(actualDeltaUrl, expectedDeltaUrl, "The constructed delta url is invalid");
		loggerMock.assertMatchNone([{ category: "error" }]);
	});

	describe("Get Returns Response With Op Envelope", () => {
		const expectedDeltaFeedResponse = {
			value: [
				{
					op: {
						clientId: "present-place",
						clientSequenceNumber: 71,
						contents: null,
						minimumSequenceNumber: 1,
						referenceSequenceNumber: 1,
						sequenceNumber: 1,
						text: "",
						user: {
							id: "Unruffled Bose",
						},
					},
					sequenceNumber: 1,
				},
				{
					op: {
						clientId: "present-place",
						clientSequenceNumber: 71,
						contents: null,
						minimumSequenceNumber: 1,
						referenceSequenceNumber: 1,
						sequenceNumber: 2,
						type: "noop",
						user: {
							id: "Unruffled Bose",
						},
					},
					sequenceNumber: 2,
				},
			],
		};

		let deltaStorageService: OdspDeltaStorageService;
		const loggerMock = new MockLogger();
		const logger = loggerMock.toTelemetryLogger();
		before(() => {
			deltaStorageService = new OdspDeltaStorageService(
				testDeltaStorageUrl,
				async (_refresh) => "",
				createUtEpochTracker(fileEntry, logger),
				logger,
			);
		});
		afterEach(() => {
			loggerMock.assertMatchNone([{ category: "error" }]);
		});

		it("Should deserialize the delta feed response correctly", async () => {
			const { messages, partialResult } = await mockFetchOk(
				async () => deltaStorageService.get(2, 8, {}),
				expectedDeltaFeedResponse,
			);
			assert(!partialResult, "partialResult === false");
			assert.equal(messages.length, 2, "Deserialized feed response is not of expected length");
			assert.equal(
				messages[0].sequenceNumber,
				1,
				"First element of feed response has invalid sequence number",
			);
			assert.equal(
				messages[1].sequenceNumber,
				2,
				"Second element of feed response has invalid sequence number",
			);
			assert.equal(
				messages[1].type,
				"noop",
				"Second element of feed response has invalid op type",
			);
		});
	});

	describe("Get Returns Response With Op Envelope", () => {
		const expectedDeltaFeedResponse = {
			value: [
				{
					clientId: "present-place",
					clientSequenceNumber: 71,
					contents: null,
					minimumSequenceNumber: 1,
					referenceSequenceNumber: 1,
					sequenceNumber: 1,
					text: "",
					user: {
						id: "Unruffled Bose",
					},
				},
				{
					clientId: "present-place",
					clientSequenceNumber: 71,
					contents: null,
					minimumSequenceNumber: 1,
					referenceSequenceNumber: 1,
					sequenceNumber: 2,
					type: "noop",
					user: {
						id: "Unruffled Bose",
					},
				},
			],
		};

		let deltaStorageService: OdspDeltaStorageService;
		const loggerMock = new MockLogger();
		const logger = loggerMock.toTelemetryLogger();
		before(() => {
			deltaStorageService = new OdspDeltaStorageService(
				testDeltaStorageUrl,
				async (_refresh) => "",
				createUtEpochTracker(fileEntry, logger),
				logger,
			);
		});
		afterEach(() => {
			loggerMock.assertMatchNone([{ category: "error" }]);
		});

		it("Should deserialize the delta feed response correctly", async () => {
			const { messages, partialResult } = await mockFetchOk(
				async () => deltaStorageService.get(2, 8, {}),
				expectedDeltaFeedResponse,
			);
			assert(!partialResult, "partialResult === false");
			assert.equal(messages.length, 2, "Deserialized feed response is not of expected length");
			assert.equal(
				messages[0].sequenceNumber,
				1,
				"First element of feed response has invalid sequence number",
			);
			assert.equal(
				messages[1].sequenceNumber,
				2,
				"Second element of feed response has invalid sequence number",
			);
			assert.equal(
				messages[1].type,
				"noop",
				"Second element of feed response has invalid op type",
			);
		});
	});

	describe("DeltaStorageServiceWith Cache Tests", () => {
		const loggerMock = new MockLogger();
		const logger = loggerMock.toTelemetryLogger();
		afterEach(() => {
			loggerMock.assertMatchNone([{ category: "error" }]);
		});

		it("FirstCacheMiss should update to first miss op seq number correctly", async () => {
			const deltasFetchResult: IDeltasFetchResult = { messages: [], partialResult: false };
			let count = 0;
			const getCached = async (
				from: number,
				to: number,
			): Promise<ISequencedDocumentMessage[]> => {
				if (count === 0) {
					count += 1;
					return [
						{
							clientId: "present-place",
							clientSequenceNumber: 71,
							contents: null,
							minimumSequenceNumber: 1,
							referenceSequenceNumber: 1,
							sequenceNumber: from,
							type: "dds",
							timestamp: Date.now(),
						},
					];
				}
				count += 1;
				assert.fail("Should not reach here");
			};
			const odspDeltaStorageServiceWithCache = new OdspDeltaStorageWithCache(
				[],
				logger,
				1000,
				1,
				async (from, to, props, reason) => deltasFetchResult,
				async (from, to) => getCached(from, to),
				(from, to) => [],
				(ops) => {},
				() =>
					({
						isFirstSnapshotFromNetwork: false,
					}) as unknown as OdspDocumentStorageService,
			);

			const messages = odspDeltaStorageServiceWithCache.fetchMessages(1, undefined);
			const batch1 = await messages.read();
			const batch2 = await messages.read();
			assert(count === 1, "There should be only 1 cache access");
			assert(batch1.done === false, "Firt batch should have returned 1 op");
			assert(batch2.done === true, "No ops should be present in second batch");
		});
	});
});
