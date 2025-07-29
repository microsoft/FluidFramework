/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions/internal";

import { OdspUrlResolver } from "../urlResolver.js";

describe("Spo Url Resolver", () => {
	it("Should resolve the spo urls correctly", async () => {
		const urlResolver = new OdspUrlResolver();
		const url: string =
			"https://microsoft-my.sharepoint-df.com/_api/v2.1/drives/randomDrive/items/randomItem";
		const resolved = (await urlResolver.resolve({ url })) as IOdspResolvedUrl;
		assert.equal(resolved.driveId, "randomDrive", "Drive id does not match");
		assert.equal(resolved.itemId, "randomItem", "Item id does not match");
		assert.equal(resolved.siteUrl, url, "Site id does not match");
		assert.equal(
			resolved.endpoints.snapshotStorageUrl,
			`${url}/opStream/snapshots`,
			"SnashotStorageUrl does not match",
		);
		assert.equal(
			resolved.url,
			`https://placeholder/placeholder/${resolved.hashedDocumentId}/`,
			"fluid url does not match",
		);
	});

	it("Should resolve the other tenant spo url correctly", async () => {
		const urlResolver = new OdspUrlResolver();
		const url: string =
			"https://random.sharepoint.com/_api/v2.1/drives/randomDrive/items/randomItem";
		const resolved = (await urlResolver.resolve({ url })) as IOdspResolvedUrl;
		assert.equal(resolved.driveId, "randomDrive", "Drive id does not match");
		assert.equal(resolved.itemId, "randomItem", "Item id does not match");
		assert.equal(resolved.siteUrl, url, "Site id does not match");
		assert.equal(
			resolved.endpoints.snapshotStorageUrl,
			`${url}/opStream/snapshots`,
			"SnashotStorageUrl does not match",
		);
		assert.equal(
			resolved.url,
			`https://placeholder/placeholder/${resolved.hashedDocumentId}/`,
			"fluid url does not match",
		);
	});
});
