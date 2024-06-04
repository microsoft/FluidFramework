/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/dot-notation */

import { strict as assert } from "node:assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import { ISnapshot, ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import { IOdspResolvedUrl, OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";
import {
	type IFluidErrorBase,
	type ITelemetryLoggerExt,
	MockLogger,
	createChildLogger,
} from "@fluidframework/telemetry-utils/internal";
import { stub } from "sinon";

import { convertToCompactSnapshot } from "../compactSnapshotWriter.js";
import { HostStoragePolicyInternal } from "../contracts.js";
import { createOdspUrl } from "../createOdspUrl.js";
import { EpochTracker } from "../epochTracker.js";
import * as fetchSnapshotImport from "../fetchSnapshot.js";
import { ISnapshotRequestAndResponseOptions } from "../fetchSnapshot.js";
import { LocalPersistentCache, NonPersistentCache } from "../odspCache.js";
import { OdspDocumentStorageService } from "../odspDocumentStorageManager.js";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver.js";
import { getHashedDocumentId } from "../odspPublicUtils.js";
import { INewFileInfo, IOdspResponse, createCacheSnapshotKey } from "../odspUtils.js";

import {
	createResponse,
	mockFetchMultiple,
	notFound,
	okResponse,
	type MockResponse,
} from "./mockFetch.js";

const createUtLocalCache = (): LocalPersistentCache => new LocalPersistentCache();

describe("Tests1 for snapshot fetch", () => {
	const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
	const driveId = "driveId";
	const itemId = "itemId";
	const filePath = "path";
	let epochTracker: EpochTracker;
	let localCache: LocalPersistentCache;
	let hashedDocumentId: string;
	let service: OdspDocumentStorageService;

	const resolvedUrl = {
		siteUrl,
		driveId,
		itemId,
		odspResolvedUrl: true,
	} as unknown as IOdspResolvedUrl;

	const newFileParams: INewFileInfo = {
		type: "New",
		driveId,
		siteUrl: "https://www.localhost.xxx",
		filePath,
		filename: "filename",
	};

	const hostPolicy: HostStoragePolicyInternal = {
		snapshotOptions: { timeout: 2000, mds: 1000 },
		summarizerClient: true,
		fetchBinarySnapshotFormat: false,
		concurrentSnapshotFetch: true,
	};

	const resolver = new OdspDriverUrlResolver();
	const nonPersistentCache = new NonPersistentCache();
	let logger: ITelemetryLoggerExt;
	let mockLogger: MockLogger;
	const odspUrl = createOdspUrl({ ...newFileParams, itemId, dataStorePath: "/" });

	const content: ISnapshot = {
		snapshotTree: {
			id: "id",
			blobs: {},
			trees: {},
		},
		blobContents: new Map(),
		ops: [],
		sequenceNumber: 0,
		latestSequenceNumber: 0,
		snapshotFormatV: 1,
	};

	let resolved: IOdspResolvedUrl;
	before(async () => {
		hashedDocumentId = await getHashedDocumentId(driveId, itemId);
	});

	beforeEach(async () => {
		localCache = createUtLocalCache();
		mockLogger = new MockLogger();
		logger = createChildLogger({ logger: mockLogger });
		// use null logger here as we expect errors
		epochTracker = new EpochTracker(
			localCache,
			{
				docId: hashedDocumentId,
				resolvedUrl,
			},
			logger,
		);
		epochTracker.setEpoch("epoch1", true, "test");
		resolved = await resolver.resolve({ url: odspUrl });
		service = new OdspDocumentStorageService(
			resolved,
			async (_options) => "token",
			logger,
			true,
			{ ...nonPersistentCache, persistedCache: epochTracker },
			hostPolicy,
			epochTracker,
			async () => {
				return {};
			},
			() => "tenantid/id",
		);
	});

	afterEach(async () => {
		await epochTracker.removeEntries().catch(() => {});
	});

	it("Mds limit check in fetch snapshot", async () => {
		let success = false;
		async function mockDownloadSnapshot<T>(
			_response: Promise<ISnapshotRequestAndResponseOptions>,
			callback: () => Promise<T>,
		): Promise<T> {
			const getDownloadSnapshotStub = stub(fetchSnapshotImport, "downloadSnapshot");
			getDownloadSnapshotStub.returns(_response);
			try {
				return await callback();
			} finally {
				assert(
					getDownloadSnapshotStub.args[0][3]?.mds === undefined,
					"mds should be undefined",
				);
				success = true;
				getDownloadSnapshotStub.restore();
			}
		}
		const odspResponse: IOdspResponse<Response> = {
			content: (await createResponse({}, content, 200)) as unknown as Response,
			duration: 10,
			headers: new Map([
				["x-fluid-epoch", "epoch1"],
				["content-type", "application/json"],
			]),
			propsToLog: {},
		};
		const response: ISnapshotRequestAndResponseOptions = {
			odspResponse,
			requestHeaders: {},
			requestUrl: siteUrl,
		};
		try {
			await mockDownloadSnapshot(Promise.resolve(response), async () =>
				service.getVersions(null, 1),
			);
		} catch {
			// Drop error
		}
		assert(success, "mds limit should not be set!!");
	});

	it("Check error in empty response", async () => {
		async function mockDownloadSnapshot<T>(
			_response: Promise<ISnapshotRequestAndResponseOptions>,
			callback: () => Promise<T>,
		): Promise<T> {
			const getDownloadSnapshotStub = stub(fetchSnapshotImport, "downloadSnapshot");
			getDownloadSnapshotStub.returns(_response);
			try {
				return await callback();
			} finally {
				getDownloadSnapshotStub.restore();
			}
		}
		const odspResponse: IOdspResponse<Response> = {
			content: (await createResponse(
				{},
				new Uint8Array().buffer,
				200,
			)) as unknown as Response,
			duration: 10,
			headers: new Map([
				["x-fluid-epoch", "epoch1"],
				["content-type", "application/ms-fluid"],
			]),
			propsToLog: {},
		};
		const response: ISnapshotRequestAndResponseOptions = {
			odspResponse,
			requestHeaders: {},
			requestUrl: siteUrl,
		};
		try {
			await mockDownloadSnapshot(Promise.resolve(response), async () =>
				service.getVersions(null, 1),
			);
			assert.fail("should throw incorrectServerResponse error");
		} catch (error: unknown) {
			assert.strictEqual(
				(error as Partial<IFluidErrorBase>).errorType,
				OdspErrorTypes.incorrectServerResponse,
				"incorrectServerResponse should be received",
			);
		}
	});

	it("Check error in snapshot content type", async () => {
		async function mockDownloadSnapshot<T>(
			_response: Promise<ISnapshotRequestAndResponseOptions>,
			callback: () => Promise<T>,
		): Promise<T> {
			const getDownloadSnapshotStub = stub(fetchSnapshotImport, "downloadSnapshot");
			getDownloadSnapshotStub.returns(_response);
			try {
				return await callback();
			} finally {
				getDownloadSnapshotStub.restore();
			}
		}
		const odspResponse: IOdspResponse<Response> = {
			content: (await createResponse({}, content, 200)) as unknown as Response,
			duration: 10,
			headers: new Map([
				["x-fluid-epoch", "epoch1"],
				["content-type", "unknown"],
			]),
			propsToLog: {},
		};
		const response: ISnapshotRequestAndResponseOptions = {
			odspResponse,
			requestHeaders: {},
			requestUrl: siteUrl,
		};
		try {
			await mockDownloadSnapshot(Promise.resolve(response), async () =>
				service.getVersions(null, 1),
			);
			assert.fail("should throw incorrectServerResponse error");
		} catch (error: unknown) {
			assert.strictEqual(
				(error as Partial<IFluidErrorBase>).errorType,
				OdspErrorTypes.incorrectServerResponse,
				"incorrectServerResponse should be received",
			);
			assert.strictEqual(
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
				(error as any).contentType,
				"unknown",
				"content type should be unknown",
			);
		}
	});

	it("GetSnapshot() should work in normal flow", async () => {
		let ungroupedData = false;
		async function mockDownloadSnapshot<T>(
			_response: Promise<ISnapshotRequestAndResponseOptions>,
			callback: () => Promise<T>,
		): Promise<T> {
			const getDownloadSnapshotStub = stub(fetchSnapshotImport, "downloadSnapshot");
			getDownloadSnapshotStub.returns(_response);
			try {
				return await callback();
			} finally {
				getDownloadSnapshotStub.restore();
				assert(
					getDownloadSnapshotStub.args[0][2]?.length === 0,
					"should ask for ungroupedData",
				);
				ungroupedData = true;
			}
		}
		const snapshot: ISnapshot = {
			blobContents,
			snapshotTree: snapshotTreeWithGroupId,
			ops: [],
			latestSequenceNumber: 0,
			sequenceNumber: 0,
			snapshotFormatV: 1,
		};
		const odspResponse: IOdspResponse<Response> = {
			content: (await createResponse(
				{},
				convertToCompactSnapshot(snapshot),
				200,
			)) as unknown as Response,
			duration: 10,
			headers: new Map([
				["x-fluid-epoch", "epoch1"],
				["content-type", "application/ms-fluid"],
			]),
			propsToLog: {},
		};
		const response: ISnapshotRequestAndResponseOptions = {
			odspResponse,
			requestHeaders: {},
			requestUrl: siteUrl,
		};
		try {
			await mockDownloadSnapshot(Promise.resolve(response), async () =>
				service.getSnapshot({ loadingGroupIds: [] }),
			);
		} catch {
			assert.fail("the getSnapshot request should succeed");
		}
		assert(ungroupedData, "should have asked for ungroupedData");
		const cachedValue = (await epochTracker.get(createCacheSnapshotKey(resolved))) as ISnapshot;
		assert(cachedValue.snapshotTree.id === "SnapshotId", "snapshot should have been cached");
		assert(service["blobCache"].value.size > 0, "blobs should be cached locally");
		assert(service["commitCache"].size > 0, "no trees should be cached");
	});

	it("GetSnapshot() should work but snapshot should not be cached locally if asked for custom groupId", async () => {
		let success = false;
		service["firstSnapshotFetchCall"] = false;
		async function mockDownloadSnapshot<T>(
			_response: Promise<ISnapshotRequestAndResponseOptions>,
			callback: () => Promise<T>,
		): Promise<T> {
			const getDownloadSnapshotStub = stub(fetchSnapshotImport, "downloadSnapshot");
			getDownloadSnapshotStub.returns(_response);
			try {
				return await callback();
			} finally {
				getDownloadSnapshotStub.restore();
				assert(
					getDownloadSnapshotStub.args[0][2]?.[0] === "g1",
					"should ask for g1 groupId",
				);
				success = true;
			}
		}
		const snapshot: ISnapshot = {
			blobContents,
			snapshotTree: snapshotTreeWithGroupId,
			ops: [],
			latestSequenceNumber: 0,
			sequenceNumber: 0,
			snapshotFormatV: 1,
		};
		const odspResponse: IOdspResponse<Response> = {
			content: (await createResponse(
				{},
				convertToCompactSnapshot(snapshot),
				200,
			)) as unknown as Response,
			duration: 10,
			headers: new Map([
				["x-fluid-epoch", "epoch1"],
				["content-type", "application/ms-fluid"],
			]),
			propsToLog: {},
		};
		const response: ISnapshotRequestAndResponseOptions = {
			odspResponse,
			requestHeaders: {},
			requestUrl: siteUrl,
		};
		try {
			await mockDownloadSnapshot(Promise.resolve(response), async () =>
				service.getSnapshot({ loadingGroupIds: ["g1"] }),
			);
		} catch (error: unknown) {
			console.log("error", error);
			assert.fail("the getSnapshot request should succeed");
		}
		assert(success, "should have asked for g1 group id");
		assert(service["blobCache"].value.size > 0, "blobs should still be cached locally");
		assert(service["commitCache"].size === 0, "no trees should be cached");
		assert(
			mockLogger.matchEvents([
				{
					eventName: "ObtainSnapshotForGroup_end",
					method: "networkOnly",
					fetchSource: "noCache",
					useLegacyFlowWithoutGroups: false,
				},
			]),
			"unexpected events",
		);
	});

	it("GetSnapshot() should not cache locally when specified in options", async () => {
		async function mockDownloadSnapshot<T>(
			_response: Promise<ISnapshotRequestAndResponseOptions>,
			callback: () => Promise<T>,
		): Promise<T> {
			const getDownloadSnapshotStub = stub(fetchSnapshotImport, "downloadSnapshot");
			getDownloadSnapshotStub.returns(_response);
			try {
				return await callback();
			} finally {
				getDownloadSnapshotStub.restore();
			}
		}
		const snapshot: ISnapshot = {
			blobContents,
			snapshotTree: snapshotTreeWithGroupId,
			ops: [],
			latestSequenceNumber: 0,
			sequenceNumber: 0,
			snapshotFormatV: 1,
		};
		const odspResponse: IOdspResponse<Response> = {
			content: (await createResponse(
				{},
				convertToCompactSnapshot(snapshot),
				200,
			)) as unknown as Response,
			duration: 10,
			headers: new Map([
				["x-fluid-epoch", "epoch1"],
				["content-type", "application/ms-fluid"],
			]),
			propsToLog: {},
		};
		const response: ISnapshotRequestAndResponseOptions = {
			odspResponse,
			requestHeaders: {},
			requestUrl: siteUrl,
		};
		try {
			await mockDownloadSnapshot(Promise.resolve(response), async () =>
				service.getSnapshot({ loadingGroupIds: [], cacheSnapshot: false }),
			);
		} catch {
			assert.fail("the getSnapshot request should succeed");
		}
		const cachedValue = (await epochTracker.get(createCacheSnapshotKey(resolved))) as ISnapshot;
		assert(cachedValue.snapshotTree.id === "SnapshotId", "snapshot should have been cached");
		assert(service["blobCache"].value.size > 0, "blobs should still be cached locally");
		assert(service["commitCache"].size === 0, "no trees should be cached");
	});

	it("GetSnapshot() should not consult cache when request is for a loading group", async () => {
		async function mockDownloadSnapshot<T>(
			_response: Promise<ISnapshotRequestAndResponseOptions>,
			callback: () => Promise<T>,
		): Promise<T> {
			const getDownloadSnapshotStub = stub(fetchSnapshotImport, "downloadSnapshot");
			getDownloadSnapshotStub.returns(_response);
			try {
				return await callback();
			} finally {
				getDownloadSnapshotStub.restore();
			}
		}
		const snapshot: ISnapshot = {
			blobContents,
			snapshotTree: snapshotTreeWithGroupId,
			ops: [],
			latestSequenceNumber: 0,
			sequenceNumber: 0,
			snapshotFormatV: 1,
		};
		const odspResponse: IOdspResponse<Response> = {
			content: (await createResponse(
				{},
				convertToCompactSnapshot(snapshot),
				200,
			)) as unknown as Response,
			duration: 10,
			headers: new Map([
				["x-fluid-epoch", "epoch1"],
				["content-type", "application/ms-fluid"],
			]),
			propsToLog: {},
		};
		const response: ISnapshotRequestAndResponseOptions = {
			odspResponse,
			requestHeaders: {},
			requestUrl: siteUrl,
		};
		try {
			await mockDownloadSnapshot(Promise.resolve(response), async () =>
				service.getSnapshot({ loadingGroupIds: [], cacheSnapshot: false }),
			);
		} catch {
			assert.fail("the getSnapshot request should succeed");
		}

		// Fetch again for a groupId
		try {
			await mockDownloadSnapshot(Promise.resolve(response), async () =>
				service.getSnapshot({ loadingGroupIds: ["g1"], cacheSnapshot: false }),
			);
		} catch {
			assert.fail("the getSnapshot request should succeed");
		}
		// Cache should not be consulted.
		assert(
			mockLogger.matchEvents([
				{
					eventName: "ObtainSnapshot_end",
					method: "network",
					useLegacyFlowWithoutGroups: false,
				},
				{
					eventName: "ObtainSnapshotForGroup_end",
					method: "networkOnly",
					fetchSource: "noCache",
					useLegacyFlowWithoutGroups: false,
				},
			]),
			"unexpected events",
		);
	});

	it("RedeemFallback behavior when fallback succeeds with using tenant domain", async () => {
		resolved.shareLinkInfo = {
			sharingLinkToRedeem: "https://microsoft.sharepoint-df.com/sharelink",
		};
		hostPolicy.enableRedeemFallback = true;

		const snapshot: ISnapshot = {
			blobContents,
			snapshotTree: snapshotTreeWithGroupId,
			ops: [],
			latestSequenceNumber: 0,
			sequenceNumber: 0,
			snapshotFormatV: 1,
		};
		const response = (await createResponse(
			{ "x-fluid-epoch": "epoch1", "content-type": "application/ms-fluid" },
			convertToCompactSnapshot(snapshot),
			200,
		)) as unknown as Response;

		await assert.doesNotReject(
			async () =>
				mockFetchMultiple(
					async () => service.getSnapshot({}),
					[
						notFound,
						async (): Promise<MockResponse> => okResponse({}, {}),
						async (): Promise<Response> => {
							return response;
						},
					],
				),
			"Should succeed",
		);
		assert(
			mockLogger.matchEvents([
				{ eventName: "TreesLatest_cancel", shareLinkPresent: true },
				{ eventName: "RedeemShareLink_end" },
				{ eventName: "RedeemFallback", errorType: "fileNotFoundOrAccessDeniedError" },
				{ eventName: "TreesLatest_end" },
			]),
		);
	});

	it("RedeemFallback behavior when fallback succeeds with using siteUrl", async () => {
		resolved.shareLinkInfo = {
			sharingLinkToRedeem: "https://microsoft.sharepoint-df.com/sharelink",
		};
		hostPolicy.enableRedeemFallback = true;

		const snapshot: ISnapshot = {
			blobContents,
			snapshotTree: snapshotTreeWithGroupId,
			ops: [],
			latestSequenceNumber: 0,
			sequenceNumber: 0,
			snapshotFormatV: 1,
		};
		const response = (await createResponse(
			{ "x-fluid-epoch": "epoch1", "content-type": "application/ms-fluid" },
			convertToCompactSnapshot(snapshot),
			200,
		)) as unknown as Response;

		await assert.doesNotReject(
			async () =>
				mockFetchMultiple(
					async () => service.getSnapshot({}),
					[
						notFound,
						notFound,
						async (): Promise<MockResponse> => okResponse({}, {}),
						async (): Promise<Response> => {
							return response;
						},
					],
				),
			"Should succeed",
		);
		assert(
			mockLogger.matchEvents([
				{ eventName: "TreesLatest_cancel", shareLinkPresent: true },
				{ eventName: "ShareLinkRedeemFailedWithTenantDomain", statusCode: 404 },
				{ eventName: "RedeemShareLink_end" },
				{ eventName: "RedeemFallback", errorType: "fileNotFoundOrAccessDeniedError" },
				{ eventName: "TreesLatest_end" },
			]),
		);
	});
});

const snapshotTreeWithGroupId: ISnapshotTree = {
	id: "SnapshotId",
	blobs: {},
	trees: {
		".protocol": {
			blobs: {},
			trees: {},
		},
		".app": {
			blobs: { ".metadata": "bARD4RKvW4LL1KmaUKp6hUMSp" },
			trees: {
				".channels": {
					blobs: {},
					trees: {
						default: {
							blobs: {},
							trees: {
								dds: {
									blobs: {},
									trees: {},
								},
							},
							groupId: "G3",
						},
					},
					unreferenced: true,
					groupId: "G2",
				},
				".blobs": { blobs: {}, trees: {} },
			},
			unreferenced: true,
			groupId: "G4",
		},
	},
};

const blobContents = new Map<string, ArrayBuffer>([
	[
		"bARD4RKvW4LL1KmaUKp6hUMSp",
		stringToBuffer(JSON.stringify({ summaryFormatVersion: 1, gcFeature: 0 }), "utf8"),
	],
]);
