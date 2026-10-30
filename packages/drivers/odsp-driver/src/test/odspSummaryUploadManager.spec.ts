/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";
import type { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import { EpochTracker } from "../epochTracker.js";
import { LocalPersistentCache } from "../odspCache.js";
import { getHashedDocumentId } from "../odspPublicUtils.js";
import { OdspSummaryUploadManager } from "../odspSummaryUploadManager.js";

import { mockFetchOk } from "./mockFetch.js";

describe("OdspSummaryUploadManager", () => {
	it("logs SPO request ids on uploadSummary_end", async () => {
		const driveId = "driveId";
		const itemId = "itemId";
		const resolvedUrl = {
			siteUrl: "https://microsoft.sharepoint-df.com/siteUrl",
			driveId,
			itemId,
			odspResolvedUrl: true,
		} as unknown as IOdspResolvedUrl;
		const logger = new MockLogger();
		const epochTracker = new EpochTracker(
			new LocalPersistentCache(),
			{ docId: await getHashedDocumentId(driveId, itemId), resolvedUrl },
			logger.toTelemetryLogger(),
		);
		const uploadManager = new OdspSummaryUploadManager(
			"https://snapshotUrl",
			async () => "Bearer token",
			logger.toTelemetryLogger(),
			epochTracker,
			() => undefined,
		);
		const tree: ISummaryTree = {
			type: SummaryType.Tree,
			tree: { blob: { type: SummaryType.Blob, content: "content" } },
		};

		const id = await mockFetchOk(
			async () =>
				uploadManager.writeSummaryTree(tree, {
					proposalHandle: undefined,
					ackHandle: "ackHandle",
					referenceSequenceNumber: 1,
				}),
			{ id: "newHandle" },
			{ "sprequestguid": "spRequestGuid", "request-id": "graphRequestId" },
		);

		assert.equal(id, "newHandle");
		logger.assertMatch(
			[
				{
					eventName: "uploadSummary_end",
					sprequestguid: "spRequestGuid",
					requestId: "graphRequestId",
				},
			],
			"uploadSummary_end should include the SPO request ids",
		);
	});
});
