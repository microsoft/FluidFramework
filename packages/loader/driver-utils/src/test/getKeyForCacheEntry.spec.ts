/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ICacheEntry, IResolvedUrl } from "@fluidframework/driver-definitions/internal";

import { getKeyForCacheEntry } from "../cacheUtils.js";

function createMockCacheEntry(type: string, key: string, fileVersion?: string): ICacheEntry {
	const resolvedUrl = {
		endpoints: {},
		id: "test-doc-id",
		tokens: {},
		type: "fluid",
		url: "fluid://resolved-url",
		fileVersion,
	} satisfies IResolvedUrl & { fileVersion?: string };
	return {
		type,
		key,
		file: {
			resolvedUrl,
			docId: resolvedUrl.id,
			fileVersion: resolvedUrl.fileVersion,
		},
	};
}

// Define both cache entry types here for readability
const opType = "ops";
const snapshotType = "snapshot";

describe("getKeyForCacheEntry", () => {
	it("creates a non-versioned snapshot cache entry", () => {
		const entry = createMockCacheEntry(snapshotType, "");
		const key = getKeyForCacheEntry(entry);
		assert.equal(key, "test-doc-id_snapshot_");
	});
	it("creates a versioned snapshot cache entry", () => {
		const entry = createMockCacheEntry(snapshotType, "", "3.0");
		const key = getKeyForCacheEntry(entry);
		assert.equal(key, "test-doc-id_3.0_snapshot_");
	});

	it("creates a non-versioned op cache entry", () => {
		const entry = createMockCacheEntry(opType, "100_5");
		const key = getKeyForCacheEntry(entry);
		assert.equal(key, "test-doc-id_ops_100_5");
	});
	it("creates a versioned op cache entry", () => {
		const entry = createMockCacheEntry(opType, "100_5", "3.0");
		const key = getKeyForCacheEntry(entry);
		assert.equal(key, "test-doc-id_3.0_ops_100_5");
	});
});
