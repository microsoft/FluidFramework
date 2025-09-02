/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	getKeyForCacheEntry,
	type CacheContentType,
	type ICacheEntry,
	type IOdspResolvedUrl,
} from "@fluidframework/odsp-driver-definitions/internal";

function createMockCacheEntry(
	url: IOdspResolvedUrl,
	type: CacheContentType,
	key: string,
): ICacheEntry {
	return {
		type,
		key,
		file: {
			resolvedUrl: url,
			docId: "test-doc-id",
		},
	};
}

// Define both cache entry types here for readability
const opType = "ops";
const snapshotType = "snapshot";

describe("getKeyForCacheEntry", () => {
	const odspResolvedUrlWithoutVersion: IOdspResolvedUrl = {
		type: "fluid",
		odspResolvedUrl: true,
		id: "1",
		siteUrl: "fakeUrl",
		driveId: "1",
		itemId: "1",
		url: "fakeUrl",
		hashedDocumentId: "1",
		endpoints: {
			snapshotStorageUrl: "fakeUrl",
			attachmentPOSTStorageUrl: "fakeUrl",
			attachmentGETStorageUrl: "fakeUrl",
			deltaStorageUrl: "fakeUrl",
		},
		tokens: {},
		fileName: "fakeName",
		summarizer: false,
		fileVersion: undefined,
	};

	const odspResolvedUrlWithVersion: IOdspResolvedUrl = {
		type: "fluid",
		odspResolvedUrl: true,
		id: "1",
		siteUrl: "fakeUrl",
		driveId: "1",
		itemId: "1",
		url: "fakeUrl",
		hashedDocumentId: "1",
		endpoints: {
			snapshotStorageUrl: "fakeUrl",
			attachmentPOSTStorageUrl: "fakeUrl",
			attachmentGETStorageUrl: "fakeUrl",
			deltaStorageUrl: "fakeUrl",
		},
		tokens: {},
		fileName: "fakeName",
		summarizer: false,
		fileVersion: "3.0",
	};

	it("creates a non-versioned snapshot cache entry", () => {
		const entry = createMockCacheEntry(odspResolvedUrlWithoutVersion, snapshotType, "");
		const key = getKeyForCacheEntry(entry);
		assert.equal(key, "test-doc-id_snapshot_");
	});
	it("creates a versioned snapshot cache entry", () => {
		const entry = createMockCacheEntry(odspResolvedUrlWithVersion, snapshotType, "");
		const key = getKeyForCacheEntry(entry);
		assert.equal(key, "test-doc-id_3.0_snapshot_");
	});

	it("creates a non-versioned op cache entry", () => {
		const entry = createMockCacheEntry(odspResolvedUrlWithoutVersion, opType, "100_5");
		const key = getKeyForCacheEntry(entry);
		assert.equal(key, "test-doc-id_ops_100_5");
	});
	it("creates a versioned op cache entry", () => {
		const entry = createMockCacheEntry(odspResolvedUrlWithVersion, opType, "100_5");
		const key = getKeyForCacheEntry(entry);
		assert.equal(key, "test-doc-id_3.0_ops_100_5");
	});
});
