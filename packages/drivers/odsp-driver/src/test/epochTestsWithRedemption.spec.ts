/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { Deferred } from "@fluidframework/core-utils";
import { MockLogger, type IFluidErrorBase } from "@fluidframework/telemetry-utils";
import {
	OdspErrorTypes,
	IOdspResolvedUrl,
	IEntry,
	snapshotKey,
} from "@fluidframework/odsp-driver-definitions";
import { EpochTrackerWithRedemption } from "../epochTracker.js";
import { LocalPersistentCache } from "../odspCache.js";
import { getHashedDocumentId } from "../odspPublicUtils.js";
import {
	mockFetchSingle,
	mockFetchMultiple,
	okResponse,
	notFound,
	MockResponse,
} from "./mockFetch.js";

class DeferralWithCallback extends Deferred<void> {
	private epochCallback: () => Promise<unknown> = async () => {};

	constructor() {
		super();
	}

	public setCallback(epochCallback: () => Promise<unknown>): void {
		this.epochCallback = epochCallback;
	}

	public get promise(): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/promise-function-async
		return this.epochCallback().then(() => super.promise);
	}
}

describe("Tests for Epoch Tracker With Redemption", () => {
	const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
	const driveId = "driveId";
	const itemId = "itemId";
	const logger = new MockLogger();
	let epochTracker: EpochTrackerWithRedemption;
	let hashedDocumentId: string;
	let epochCallback: DeferralWithCallback;

	before(async () => {
		hashedDocumentId = await getHashedDocumentId(driveId, itemId);
	});

	beforeEach(() => {
		const resolvedUrl = {
			siteUrl,
			driveId,
			itemId,
			odspResolvedUrl: true,
		} as unknown as IOdspResolvedUrl;
		epochTracker = new EpochTrackerWithRedemption(
			new LocalPersistentCache(),
			{
				docId: hashedDocumentId,
				resolvedUrl,
			},
			logger.toTelemetryLogger(),
		);
	});

	afterEach(async () => {
		await epochTracker.removeEntries().catch(() => {});
		logger.assertMatchNone([{ category: "error" }]);
	});

	describe("Test Suite 1", () => {
		beforeEach(() => {
			epochCallback = new DeferralWithCallback();
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			(epochTracker as any).treesLatestDeferral = epochCallback;
		});
		it("joinSession call should succeed on retrying after snapshot cached read succeeds", async () => {
			epochTracker.setEpoch("epoch1", true, "test");
			const cacheEntry1: IEntry = {
				type: snapshotKey,
				key: "key1",
			};
			await epochTracker.put(cacheEntry1, { val: "val1" });

			// We will trigger a successful call to return the value set in the cache after the failed joinSession call
			epochCallback.setCallback(async () => epochTracker.get(cacheEntry1));

			// Initial joinSession call will return 404 but after the timeout, the call will be retried and succeed
			await mockFetchMultiple(
				async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "joinSession"),
				[
					notFound,
					async (): Promise<MockResponse> =>
						okResponse({ "x-fluid-epoch": "epoch1" }, {}),
				],
			);
		});

		it("joinSession call should succeed on retrying after any network call to the file succeeds", async () => {
			epochTracker.setEpoch("epoch1", true, "test");
			const cacheEntry1: IEntry = {
				type: snapshotKey,
				key: "key1",
			};
			await epochTracker.put(cacheEntry1, { val: "val1" });

			// We will trigger a successful call to return the value set in the cache after the failed joinSession call
			epochCallback.setCallback(async () => {
				return epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "treesLatest");
			});

			// Initial joinSession call will return 404 but after the timeout, the call will be retried and succeed
			await mockFetchMultiple(
				async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "joinSession"),
				[
					notFound, // joinSession
					async (): Promise<MockResponse> =>
						okResponse({ "x-fluid-epoch": "epoch1" }, {}), // "treesLatest"
					async (): Promise<MockResponse> =>
						okResponse({ "x-fluid-epoch": "epoch1" }, {}), // "joinSession"
				],
			);
		});

		it("Requests should fail if joinSession call fails and the getLatest call also fails", async () => {
			let success: boolean = true;

			try {
				epochCallback.setCallback(async () => {
					try {
						await mockFetchSingle(
							async () =>
								epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "treesLatest"),
							notFound,
							"internal",
						);
					} catch (error: unknown) {
						assert.strictEqual(
							(error as Partial<IFluidErrorBase>).errorType,
							OdspErrorTypes.fileNotFoundOrAccessDeniedError,
							"Error should be file not found or access denied error",
						);
					}
				});
				await mockFetchSingle(
					async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "joinSession"),
					async () => notFound({ "x-fluid-epoch": "epoch1" }),
					"external",
				);
			} catch (error: unknown) {
				success = false;
				assert.strictEqual(
					(error as Partial<IFluidErrorBase>).errorType,
					OdspErrorTypes.fileNotFoundOrAccessDeniedError,
					"Error should be file not found or access denied error",
				);
			}
			assert.strictEqual(
				success,
				false,
				"Join session should fail if treesLatest call has failed",
			);
		});
	});

	describe("Tests Suite 2", () => {
		it("Failed treesLatest call should not trigger unhandled rejection event", async () => {
			const treesLatestP = mockFetchSingle(
				async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "treesLatest"),
				notFound,
			);
			await assert.rejects(
				treesLatestP,
				"should fail without causing an unhandledRejection event.",
			);
		});
	});
});
