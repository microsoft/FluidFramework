/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import { getFileLink } from "../getFileLink.js";

import {
	MockResponse,
	createResponse,
	mockFetchMultiple,
	mockFetchSingle,
	notFound,
	okResponse,
} from "./mockFetch.js";

describe("getFileLink", () => {
	const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
	const newSiteUrl = "https://microsoft.sharepoint.com/siteUrl";
	const driveId = "driveId";
	const logger = new MockLogger();
	const storageTokenFetcher = async (): Promise<string> => "StorageToken";
	const fileItemResponse = {
		webDavUrl: "fetchDavUrl",
		webUrl: "fetchWebUrl",
		sharepointIds: { listItemUniqueId: "fetchFileId" },
	};

	afterEach(() => {
		logger.assertMatchNone([{ category: "error" }]);
	});

	it("should return share link with existing access", async () => {
		const result = await mockFetchMultiple(
			async () =>
				getFileLink(
					storageTokenFetcher,
					{ siteUrl, driveId, itemId: "itemId4" },
					logger.toTelemetryLogger(),
				),
			[
				async (): Promise<MockResponse> => okResponse({}, fileItemResponse),
				async (): Promise<MockResponse> => okResponse({}, { d: { directUrl: "sharelink" } }),
			],
		);
		assert.strictEqual(
			result,
			"sharelink",
			"File link should match url returned from sharing information",
		);
	});

	it("should reject if file web dav url is missing", async () => {
		await assert.rejects(
			mockFetchMultiple(
				async () =>
					getFileLink(
						storageTokenFetcher,
						{ siteUrl, driveId, itemId: "itemId5" },
						logger.toTelemetryLogger(),
					),
				[
					async (): Promise<MockResponse> => okResponse({}, {}),
					// We retry once on malformed response from server, so need a second response mocked.
					async (): Promise<MockResponse> => okResponse({}, {}),
				],
			),
			"File link should reject for malformed url",
		);
	});

	it("should reject if file item is not found", async () => {
		await assert.rejects(
			mockFetchSingle(async () => {
				return getFileLink(
					storageTokenFetcher,
					{ siteUrl, driveId, itemId: "itemId6" },
					logger.toTelemetryLogger(),
				);
			}, notFound),
			"File link should reject when not found",
		);
	});

	it("should successfully retry", async () => {
		const result = await mockFetchMultiple(
			async () =>
				getFileLink(
					storageTokenFetcher,
					{ siteUrl, driveId, itemId: "itemId7" },
					logger.toTelemetryLogger(),
				),
			[
				async (): Promise<MockResponse> =>
					createResponse({ "retry-after": "0.001" }, undefined, 900),
				async (): Promise<MockResponse> => okResponse({}, fileItemResponse),
				async (): Promise<MockResponse> => okResponse({}, { d: { directUrl: "sharelink" } }),
			],
		);
		assert.strictEqual(
			result,
			"sharelink",
			"File link should match url returned from sharing information",
		);
		// Should be present in cache now and subsequent calls should fetch from cache.
		const sharelink2 = await getFileLink(
			storageTokenFetcher,
			{ siteUrl, driveId, itemId: "itemId7" },
			logger.toTelemetryLogger(),
		);
		assert.strictEqual(
			sharelink2,
			"sharelink",
			"File link should match url returned from sharing information from cache",
		);
	});

	it("should successfully give up after 5 tries", async () => {
		await assert.rejects(
			mockFetchMultiple(
				async () =>
					getFileLink(
						storageTokenFetcher,
						{ siteUrl, driveId, itemId: "itemId7" },
						logger.toTelemetryLogger(),
					),
				[
					async (): Promise<MockResponse> =>
						createResponse({ "retry-after": "0.001" }, undefined, 900),
					async (): Promise<MockResponse> =>
						createResponse({ "retry-after": "0.001" }, undefined, 900),
					async (): Promise<MockResponse> =>
						createResponse({ "retry-after": "0.001" }, undefined, 900),
					async (): Promise<MockResponse> =>
						createResponse({ "retry-after": "0.001" }, undefined, 900),
					async (): Promise<MockResponse> =>
						createResponse({ "retry-after": "0.001" }, undefined, 900),
				],
			),
			"did not retries 5 times",
		);
	});

	it("should handle location redirection once", async () => {
		const result = await mockFetchMultiple(
			async () =>
				getFileLink(
					storageTokenFetcher,
					{ siteUrl, driveId, itemId: "itemId8" },
					logger.toTelemetryLogger(),
				),
			[
				async (): Promise<MockResponse> =>
					createResponse(
						{ Location: newSiteUrl },
						{
							error: {
								message: "locationMoved",
							},
						},
						308,
					),
				async (): Promise<MockResponse> => okResponse({}, fileItemResponse),
				async (): Promise<MockResponse> => okResponse({}, { d: { directUrl: "sharelink" } }),
			],
		);
		assert.strictEqual(
			result,
			"sharelink",
			"File link should match url returned from sharing information",
		);
		// Should be present in cache now and subsequent calls should fetch from cache.
		const sharelink2 = await getFileLink(
			storageTokenFetcher,
			{ siteUrl, driveId, itemId: "itemId8" },
			logger.toTelemetryLogger(),
		);
		assert.strictEqual(
			sharelink2,
			"sharelink",
			"File link should match url returned from sharing information from cache",
		);
	});

	it("should handle location redirection multiple times", async () => {
		const result = await mockFetchMultiple(
			async () =>
				getFileLink(
					storageTokenFetcher,
					{ siteUrl, driveId, itemId: "itemId9" },
					logger.toTelemetryLogger(),
				),
			[
				async (): Promise<MockResponse> =>
					createResponse(
						{ Location: newSiteUrl },
						{
							error: {
								message: "locationMoved",
							},
						},
						302,
					),
				async (): Promise<MockResponse> =>
					createResponse(
						{ Location: newSiteUrl },
						{
							error: {
								message: "locationMoved",
							},
						},
						307,
					),
				async (): Promise<MockResponse> => okResponse({}, fileItemResponse),
				async (): Promise<MockResponse> => okResponse({}, { d: { directUrl: "sharelink" } }),
			],
		);
		assert.strictEqual(
			result,
			"sharelink",
			"File link should match url returned from sharing information",
		);
		// Should be present in cache now and subsequent calls should fetch from cache.
		const sharelink2 = await getFileLink(
			storageTokenFetcher,
			{ siteUrl, driveId, itemId: "itemId9" },
			logger.toTelemetryLogger(),
		);
		assert.strictEqual(
			sharelink2,
			"sharelink",
			"File link should match url returned from sharing information from cache",
		);
	});

	it("should handle location redirection max 5 times", async () => {
		await assert.rejects(
			mockFetchMultiple(async () => {
				return getFileLink(
					storageTokenFetcher,
					{ siteUrl, driveId, itemId: "itemId10" },
					logger.toTelemetryLogger(),
				);
			}, [
				async (): Promise<MockResponse> =>
					createResponse(
						{ Location: newSiteUrl },
						{
							error: {
								message: "locationMoved",
							},
						},
						308,
					),
				async (): Promise<MockResponse> =>
					createResponse(
						{ Location: newSiteUrl },
						{
							error: {
								message: "locationMoved",
							},
						},
						308,
					),
				async (): Promise<MockResponse> =>
					createResponse(
						{ Location: newSiteUrl },
						{
							error: {
								message: "locationMoved",
							},
						},
						308,
					),
				async (): Promise<MockResponse> =>
					createResponse(
						{ Location: newSiteUrl },
						{
							error: {
								message: "locationMoved",
							},
						},
						308,
					),
				async (): Promise<MockResponse> =>
					createResponse(
						{ Location: newSiteUrl },
						{
							error: {
								message: "locationMoved",
							},
						},
						308,
					),
				async (): Promise<MockResponse> =>
					createResponse(
						{ Location: newSiteUrl },
						{
							error: {
								message: "locationMoved",
							},
						},
						308,
					),
			]),
			"File link should reject when not found",
		);
	});
});
