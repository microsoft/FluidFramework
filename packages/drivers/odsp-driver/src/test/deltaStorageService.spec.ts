/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IDeltasFetchResult,
	IFileEntry,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import type { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import type { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/legacy";

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
	const fileEntry = { docId: "docId", resolvedUrl, fileVersion: undefined };

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
