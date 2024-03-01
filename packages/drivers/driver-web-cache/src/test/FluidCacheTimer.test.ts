/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/dot-notation */

import { openDB } from "idb";
import { ICacheEntry } from "@fluidframework/odsp-driver-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { delay } from "@fluidframework/core-utils";
import { FluidDriverCacheDBName } from "../FluidCacheIndexedDb.js";
import { FluidCache } from "../FluidCache.js";

// eslint-disable-next-line import/no-unassigned-import, @typescript-eslint/no-require-imports, import/no-internal-modules
require("fake-indexeddb/auto");

const mockPartitionKey = "FAKEPARTITIONKEY";

function getFluidCache(config?: {
	maxCacheItemAge?: number;
	// eslint-disable-next-line @rushstack/no-new-null
	partitionKey?: string | null;
	logger?: MockLogger;
}) {
	return new FluidCache({
		partitionKey: config?.partitionKey ?? mockPartitionKey,
		maxCacheItemAge: config?.maxCacheItemAge ?? 3 * 24 * 60 * 60 * 1000,
		logger: config?.logger,
		closeDbAfterMs: 100,
	});
}

class DateMock {
	// The current time being used by the mock
	public static mockTimeMs: number = 0;

	public static now() {
		return DateMock.mockTimeMs;
	}

	public getTime() {
		return DateMock.mockTimeMs;
	}
}

// Sets up a mock date time for the current test. Returns a function that should be called to reset the environment
export function setupDateMock(startMockTime: number) {
	const realDate = window.Date;
	DateMock.mockTimeMs = startMockTime;
	(window.Date as any) = DateMock;

	return () => (window.Date = realDate);
}

// Gets a mock cache entry from an item key, all entries returned will be for the same document.
function getMockCacheEntry(itemKey: string, options?: { docId: string }): ICacheEntry {
	return {
		file: {
			docId: options?.docId ?? "myDocument",
			resolvedUrl: {
				type: "fluid",
				url: "https://bing.com/myDocument",
				id: "mockContainer",
				tokens: {},
				endpoints: {},
			},
		},
		type: "snapshot",
		key: itemKey,
	};
}

describe("FluidCacheTimer tests", () => {
	beforeEach(() => {
		// Reset the indexed db before each test so that it starts off in an empty state
		// eslint-disable-next-line import/no-internal-modules, @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
		const FDBFactory = require("fake-indexeddb/lib/FDBFactory");
		(window.indexedDB as any) = new FDBFactory();
	});

	it("db should be closed after the close timer", async () => {
		const logger = new MockLogger();
		const fluidCache = getFluidCache({ logger });

		const cacheEntry = getMockCacheEntry("someKey");
		const cachedItem = { dateToStore: "foo" };
		await fluidCache.put(cacheEntry, cachedItem);
		expect(fluidCache["db"] !== undefined).toEqual(true);
		// Wait for timer to pass.
		await delay(101);
		expect(fluidCache["db"] === undefined).toEqual(true);
		expect(fluidCache["dbCloseTimer"] === undefined).toEqual(true);
	});

	it("db should be closed after the version upgrade", async () => {
		const logger = new MockLogger();
		const fluidCache = getFluidCache({ logger });

		const cacheEntry = getMockCacheEntry("someKey");
		const cachedItem = { dateToStore: "foo" };
		await fluidCache.put(cacheEntry, cachedItem);
		expect(fluidCache["db"] !== undefined).toEqual(true);
		// Create a DB with a much newer version number to force version upgrade on older cache causing it to close.
		await openDB(FluidDriverCacheDBName, 1000000);
		expect(fluidCache["db"] === undefined).toEqual(true);
		expect(fluidCache["dbCloseTimer"] === undefined).toEqual(true);
	});

	it("db should be closed after the version upgrade", async () => {
		const logger = new MockLogger();
		const fluidCache = getFluidCache({ logger });

		const cacheEntry = getMockCacheEntry("someKey");
		const cachedItem = { dateToStore: "foo" };
		await fluidCache.put(cacheEntry, cachedItem);
		expect(fluidCache["db"] !== undefined).toEqual(true);
		// Create a DB with a much newer version number to force version upgrade on older cache causing it to close.
		await openDB(FluidDriverCacheDBName, 1000000);
		expect(fluidCache["db"] === undefined).toEqual(true);
		expect(fluidCache["dbCloseTimer"] === undefined).toEqual(true);
	});
});
