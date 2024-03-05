/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { IDocumentService } from "@fluidframework/driver-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { MockLogger, isFluidError } from "@fluidframework/telemetry-utils";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { OdspErrorTypes, IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver.js";
import { OdspDocumentServiceFactory } from "../odspDocumentServiceFactory.js";
import { getOdspResolvedUrl } from "../odspUtils.js";
import { getHashedDocumentId } from "../odspPublicUtils.js";
import { LocalPersistentCache } from "../odspCache.js";
import { createOdspCreateContainerRequest } from "../createOdspCreateContainerRequest.js";
import { mockFetchOk, mockFetchMultiple, okResponse } from "./mockFetch.js";

describe("Odsp Create Container Test", () => {
	const siteUrl = "https://www.localhost.xxx";
	const driveId = "driveId";
	const filePath = "path";
	const fileName = "fileName";
	const logger = new MockLogger();
	let resolver: OdspDriverUrlResolver;
	let request: IRequest;

	const itemId = "fakeItemId";
	const expectedResponse = {
		context: "http://sp.devinstall/_api/v2.1/$metadata#",
		sequenceNumber: 1,
		sha: "shaxxshaxx",
		itemUrl: `http://fake.microsoft.com/_api/v2.1/drives/${driveId}/items/${itemId}`,
		driveId,
		itemId,
		id: "fakeSummaryHandle",
	};

	const odspDocumentServiceFactory = new OdspDocumentServiceFactory(
		async (_options) => "token",
		async (_options) => "token",
		new LocalPersistentCache(2000),
		{ snapshotOptions: { timeout: 2000 } },
	);

	const createSummary = (putAppTree: boolean, putProtocolTree: boolean): ISummaryTree => {
		const summary: ISummaryTree = {
			type: SummaryType.Tree,
			tree: {},
		};
		if (putAppTree) {
			summary.tree[".app"] = {
				type: SummaryType.Tree,
				tree: {},
			};
		}
		if (putProtocolTree) {
			summary.tree[".protocol"] = {
				type: SummaryType.Tree,
				tree: {
					attributes: {
						type: SummaryType.Blob,
						content: JSON.stringify({
							branch: "",
							minimumSequenceNumber: 0,
							sequenceNumber: 0,
						}),
					},
				},
			};
		}
		return summary;
	};

	const createService = async (
		summary: ISummaryTree,
		resolved: IOdspResolvedUrl,
	): Promise<IDocumentService> =>
		odspDocumentServiceFactory.createContainer(summary, resolved, logger);

	beforeEach(() => {
		resolver = new OdspDriverUrlResolver();
		request = createOdspCreateContainerRequest(siteUrl, driveId, filePath, fileName);
	});
	afterEach(() => {
		logger.assertMatchNone([{ category: "error" }]);
	});

	it("Check Document Service Successfully", async () => {
		const resolved = await resolver.resolve(request);
		const docID = await getHashedDocumentId(driveId, itemId);
		const summary = createSummary(true, true);
		const docService = await mockFetchOk(
			async () => odspDocumentServiceFactory.createContainer(summary, resolved, logger),
			expectedResponse,
			{ "x-fluid-epoch": "epoch1" },
		);
		const finalResolverUrl = getOdspResolvedUrl(docService.resolvedUrl);
		assert.strictEqual(finalResolverUrl.driveId, driveId, "Drive Id should match");
		assert.strictEqual(finalResolverUrl.itemId, itemId, "ItemId should match");
		assert.strictEqual(finalResolverUrl.siteUrl, siteUrl, "SiteUrl should match");
		assert.strictEqual(finalResolverUrl.hashedDocumentId, docID, "DocId should match");

		const url = `https://placeholder/placeholder/${docID}/`;
		const snapshotUrl = `${siteUrl}/_api/v2.1/drives/${driveId}/items/${itemId}/opStream/snapshots`;
		assert.strictEqual(finalResolverUrl.url, url, "Url should match");
		assert.strictEqual(
			finalResolverUrl.endpoints.snapshotStorageUrl,
			snapshotUrl,
			"Snapshot url should match",
		);
	});

	it("No App Summary", async () => {
		const resolved = await resolver.resolve(request);
		const summary = createSummary(false, true);
		await assert.rejects(
			createService(summary, resolved),
			"Doc service should not be created because there was no app summary",
		);
	});

	it("No protocol Summary", async () => {
		const resolved = await resolver.resolve(request);
		const summary = createSummary(true, false);
		await assert.rejects(
			createService(summary, resolved),
			"Doc service should not be created because there was no protocol summary",
		);
	});

	it("No item id in response from server", async () => {
		const resolved = await resolver.resolve(request);
		const summary = createSummary(true, true);

		try {
			await mockFetchMultiple(
				async () => createService(summary, resolved),
				[
					// Due to retry logic in getWithRetryForTokenRefresh() for OdspErrorTypes.incorrectServerResponse
					// Need to mock two calls
					async (): Promise<object> => okResponse({}, {}),
					async (): Promise<object> => okResponse({}, {}),
				],
			);
		} catch (error: unknown) {
			assert(isFluidError(error), "Error should be IFluidError");
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			assert.strictEqual((error as any).statusCode, undefined, "Wrong error code");
			assert.strictEqual(
				error.errorType,
				OdspErrorTypes.incorrectServerResponse,
				"Error type should be correct",
			);
			assert.strictEqual(
				error.message,
				"ODSP CreateFile call returned no item ID",
				"Message should be correct",
			);
		}
	});
});
