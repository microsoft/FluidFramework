/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { hasOdcOrigin, isOdcUrl, isSpoUrl } from "../odspUrlHelper.js";

describe("odspUrlHelper", () => {
	describe("hasOdcOrigin", () => {
		it("validates onedrive.com correctly", () => {
			assert.equal(hasOdcOrigin(new URL("https://onedrive.com")), true);
			assert.equal(hasOdcOrigin(new URL("https://foo.onedrive.com")), true);
			assert.equal(hasOdcOrigin(new URL("https://onedrive.com.example.com")), false);
		});

		it("validates storage.live.com correctly", () => {
			assert.equal(hasOdcOrigin(new URL("https://storage.live.com")), true);
			assert.equal(hasOdcOrigin(new URL("https://foo.storage.live.com")), true);
			assert.equal(hasOdcOrigin(new URL("https://storage.live.com.example.com")), false);
		});

		it("validates storage.live-int.com correctly", () => {
			assert.equal(hasOdcOrigin(new URL("https://storage.live-int.com")), true);
			assert.equal(hasOdcOrigin(new URL("https://foo.storage.live-int.com")), true);
			assert.equal(hasOdcOrigin(new URL("https://storage.live-int.com.example.com")), false);
		});

		it("validates onedrive-tst.com correctly", () => {
			assert.equal(hasOdcOrigin(new URL("https://onedrive-tst.com")), true);
			assert.equal(hasOdcOrigin(new URL("https://foo.onedrive-tst.com")), true);
			assert.equal(hasOdcOrigin(new URL("https://onedrive-tst.com.example.com")), false);
		});
	});

	describe("isSpoUrl", () => {
		it("validates sharepoint.com hostname correctly", () => {
			assert.equal(
				isSpoUrl(new URL("https://sharepoint.com/_api/v2.1/drives/bar/items/baz")),
				false,
			);
			assert.equal(
				isSpoUrl(new URL("https://foo.sharepoint.com/_api/v2.1/drives/bar/items/baz")),
				true,
			);
			assert.equal(
				isSpoUrl(
					new URL("https://foo.sharepoint.com.example.com/_api/v2.1/drives/bar/items/baz"),
				),
				false,
			);
			assert.equal(
				isSpoUrl(
					new URL(
						"https://example.com?url=https://foo.sharepoint.com/_api/v2.1/drives/bar/items/baz",
					),
				),
				false,
			);
		});

		it("validates sharepoint-df.com hostname correctly", () => {
			assert.equal(
				isSpoUrl(new URL("https://sharepoint-df.com/_api/v2.1/drives/bar/items/baz")),
				false,
			);
			assert.equal(
				isSpoUrl(new URL("https://foo.sharepoint-df.com/_api/v2.1/drives/bar/items/baz")),
				true,
			);
			assert.equal(
				isSpoUrl(
					new URL("https://foo.sharepoint-df.com.example.com/_api/v2.1/drives/bar/items/baz"),
				),
				false,
			);
			assert.equal(
				isSpoUrl(
					new URL(
						"https://example.com?url=https://foo.sharepoint-df.com/_api/v2.1/drives/bar/items/baz",
					),
				),
				false,
			);
			assert.equal(
				isSpoUrl(new URL("https://foo.sharepoint-df-df.com/_api/v2.1/drives/bar/items/baz")),
				false,
			);
		});

		it("validates malformed paths correctly", () => {
			assert.equal(
				isSpoUrl(new URL("https://foo.sharepoint.com/_api/v2x1/drives/bar/items/baz")),
				false,
			);
			assert.equal(
				isSpoUrl(new URL("https://foo.sharepoint.com/_api/v2.1/drives//items/baz")),
				false,
			);
			assert.equal(
				isSpoUrl(new URL("https://foo.sharepoint.com/_api/v2.1/drives/bar/items/")),
				false,
			);
			assert.equal(
				isSpoUrl(new URL("https://foo.sharepoint.com/qux/_api/v2.1/drives/bar/items/baz")),
				false,
			);
		});
	});

	describe("isOdcUrl", () => {
		it("validates expected path formats correctly", async () => {
			assert.equal(
				isOdcUrl(new URL("https://foo.onedrive.com/v2.1/drive/items/ABC123!123")),
				true,
			);
			assert.equal(
				isOdcUrl(new URL("https://foo.onedrive.com/v2.1/drives/ABC123/items/ABC123!123")),
				true,
			);
			assert.equal(
				isOdcUrl(
					new URL("https://foo.onedrive.com/v2.1/drives('ABC123')/items('ABC123!123')"),
				),
				true,
			);

			assert.equal(
				isOdcUrl(new URL("https://foo.onedrive.com/v2.1/drive/items/abc123!123")),
				true,
			);
			assert.equal(
				isOdcUrl(new URL("https://foo.onedrive.com/v2.1/drives/abc123/items/abc123!123")),
				true,
			);
			assert.equal(
				isOdcUrl(
					new URL("https://foo.onedrive.com/v2.1/drives('abc123')/items('abc123!123')"),
				),
				true,
			);
		});

		it("validates malformed paths correctly", async () => {
			assert.equal(
				isOdcUrl(new URL("https://foo.onedrive.com/qux/v2.1/drives/ABC123/items/ABC123!123")),
				false,
			);
			assert.equal(
				isOdcUrl(new URL("https://foo.onedrive.com/_api/v2.1/drives/ABC123/items/ABC123!123")),
				false,
			);
			assert.equal(
				isOdcUrl(new URL("https://foo.onedrive.com/v2x1/drives/ABC123/items/ABC123!123")),
				false,
			);

			assert.equal(
				isOdcUrl(
					new URL("https://foo.onedrive.com/qux/v2.1/drives('ABC123')/items('ABC123!123')"),
				),
				false,
			);
			assert.equal(
				isOdcUrl(
					new URL("https://foo.onedrive.com/_api/v2.1/drives('ABC123')/items('ABC123!123')"),
				),
				false,
			);
			assert.equal(
				isOdcUrl(
					new URL("https://foo.onedrive.com/v2x1/drives('ABC123')/items('ABC123!123')"),
				),
				false,
			);
		});
	});
});
