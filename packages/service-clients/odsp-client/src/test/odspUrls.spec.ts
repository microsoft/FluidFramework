/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { buildOdspBlobContentUrl } from "../odspUrls.js";

describe("buildOdspBlobContentUrl", () => {
	it("constructs URL with base endpoint and storage ID", () => {
		const attachmentGETStorageUrl =
			"https://example.sharepoint.com/_api/v2.1/drives/driveId/items/itemId/attachments";
		const storageId = "blobStorageId123";

		const result = buildOdspBlobContentUrl(attachmentGETStorageUrl, storageId);

		assert.strictEqual(
			result,
			"https://example.sharepoint.com/_api/v2.1/drives/driveId/items/itemId/attachments/blobStorageId123/content",
		);
	});

	it("URL-encodes special characters in storage ID", () => {
		const attachmentGETStorageUrl = "https://example.sharepoint.com/_api/attachments";
		const storageId = "blob/with spaces&special=chars";

		const result = buildOdspBlobContentUrl(attachmentGETStorageUrl, storageId);

		assert.strictEqual(
			result,
			"https://example.sharepoint.com/_api/attachments/blob%2Fwith%20spaces%26special%3Dchars/content",
		);
	});

	it("handles storage ID with unicode characters", () => {
		const attachmentGETStorageUrl = "https://example.sharepoint.com/_api/attachments";
		const storageId = "blob-日本語-émoji-🎉";

		const result = buildOdspBlobContentUrl(attachmentGETStorageUrl, storageId);

		// Verify the URL is properly encoded
		assert.ok(result.includes("/content"));
		assert.ok(result.includes(encodeURIComponent(storageId)));
	});
});
