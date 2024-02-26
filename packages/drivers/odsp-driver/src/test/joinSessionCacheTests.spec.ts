/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { IResolvedUrl } from "@fluidframework/driver-definitions";
import { IOdspResolvedUrl, ISocketStorageDiscovery } from "@fluidframework/odsp-driver-definitions";
import { OdspDocumentServiceFactory } from "../odspDocumentServiceFactory.js";
import { getJoinSessionCacheKey } from "../odspUtils.js";

describe("expose joinSessionInfo Tests", () => {
	const siteUrl = "https://www.localhost.xxx";
	const driveId = "driveId";
	const itemId = "itemId";

	const resolvedUrl = {
		siteUrl,
		driveId,
		itemId,
		odspResolvedUrl: true,
	} as unknown as IOdspResolvedUrl;

	const joinSessionResponse: ISocketStorageDiscovery = {
		deltaStorageUrl: "https://fake/deltaStorageUrl",
		deltaStreamSocketUrl: "https://localhost:3001",
		id: "id",
		tenantId: "tenantId",
		snapshotStorageUrl: "https://fake/snapshotStorageUrl",
		refreshSessionDurationSeconds: 100,
	};
	const odspDocumentServiceFactory = new OdspDocumentServiceFactory(
		async (_options) => "token",
		async (_options) => "token",
	);

	it("Response missing in join session cache", async () => {
		const info = await odspDocumentServiceFactory.getRelayServiceSessionInfo(resolvedUrl);
		assert(info === undefined, "no cached response");
	});

	it("Response present in join session cache", async () => {
		// eslint-disable-next-line @typescript-eslint/dot-notation, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		odspDocumentServiceFactory["nonPersistentCache"].sessionJoinCache.add(
			getJoinSessionCacheKey(resolvedUrl),
			async () => {
				return { entryTime: Date.now(), joinSessionResponse };
			},
		);
		const info = await odspDocumentServiceFactory.getRelayServiceSessionInfo(resolvedUrl);
		assert.deepStrictEqual(info, joinSessionResponse, "cached response should be present");
	});

	it("should throw error is resolved url is not odspResolvedUrl", async () => {
		let failed = false;
		try {
			await odspDocumentServiceFactory.getRelayServiceSessionInfo({
				...resolvedUrl,
				odspResolvedUrl: false,
			} as unknown as IResolvedUrl);
		} catch {
			failed = true;
		}
		assert(failed, "resolved url not correct");
	});
});
