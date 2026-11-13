/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/dot-notation */

import { strict as assert } from "node:assert";

import { fromUtf8ToBase64, stringToBuffer } from "@fluid-internal/client-utils";
import {
	DriverErrorTypes,
	type ISnapshot,
	type ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";
import {
	type IOdspResolvedUrl,
	type InstrumentedStorageTokenFetcher,
	OdspErrorTypes,
} from "@fluidframework/odsp-driver-definitions/internal";
import type {
	IFluidErrorBase,
	TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";
import { createChildLogger, MockLogger } from "@fluidframework/telemetry-utils/internal";
import type { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/legacy";
import { type SinonStub, stub } from "sinon";

import { currentReadVersion } from "../compactSnapshotParser.js";
import { convertToCompactSnapshot } from "../compactSnapshotWriter.js";
import type { HostStoragePolicyInternal } from "../contracts.js";
import { ClpCompliantAppHeader } from "../contractsPublic.js";
import { createOdspUrl } from "../createOdspUrl.js";
import { EpochTracker } from "../epochTracker.js";
import {
	downloadSnapshot,
	type ISnapshotRequestAndResponseOptions,
	SnapshotFormatSupportType,
} from "../fetchSnapshot.js";
import { mockify } from "../mockify.js";
import { LocalPersistentCache, NonPersistentCache } from "../odspCache.js";
import { OdspDocumentStorageService } from "../odspDocumentStorageManager.js";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver.js";
import { getHashedDocumentId } from "../odspPublicUtils.js";
import {
	type INewFileInfo,
	type IOdspResponse,
	createCacheSnapshotKey,
	getWithRetryForTokenRefresh,
} from "../odspUtils.js";

import {
	createResponse,
	mockFetchMultiple,
	notFound,
	okResponse,
	type MockResponse,
} from "./mockFetch.js";

const createUtLocalCache = (): LocalPersistentCache => new LocalPersistentCache();

describe("Snapshot download authorization", () => {
	let resolved: IOdspResolvedUrl;
	let epochTracker: EpochTracker;
	let fetchStub: SinonStub<Parameters<typeof fetch>, ReturnType<typeof fetch>>;
	let getAuthHeader: SinonStub<
		Parameters<InstrumentedStorageTokenFetcher>,
		ReturnType<InstrumentedStorageTokenFetcher>
	>;
	const sharingLink = "https://example.com/share?key=value";
	const hostHeaders = { "X-Agent-Id": "snapshot-agent" };

	beforeEach(async () => {
		resolved = {
			...(await new OdspDriverUrlResolver().resolve({
				url: createOdspUrl({
					siteUrl: "https://microsoft.sharepoint.com/siteUrl",
					driveId: "driveId",
					itemId: "itemId",
					dataStorePath: "/",
				}),
			})),
			isClpCompliantApp: true,
			shareLinkInfo: { sharingLinkToRedeem: sharingLink },
		};
		epochTracker = new EpochTracker(
			createUtLocalCache(),
			{ docId: resolved.hashedDocumentId, resolvedUrl: resolved },
			createChildLogger({ logger: new MockLogger() }),
			undefined,
			hostHeaders,
		);
		epochTracker.setEpoch("epoch1", true, "test");
		fetchStub = stub(globalThis, "fetch").resolves(
			new Response("{}", { headers: { "x-fluid-epoch": "epoch1" } }),
		);
		getAuthHeader = stub<
			Parameters<InstrumentedStorageTokenFetcher>,
			ReturnType<InstrumentedStorageTokenFetcher>
		>().callsFake(async (options) => {
			assert(options.request !== undefined);
			return `MSAuth1.0 popToken="${options.request.method} ${options.request.url}", type="AT_POP"`;
		});
	});

	afterEach(async () => {
		fetchStub.restore();
		await epochTracker.removeEntries();
	});

	for (const [scheme, useEffectiveMethodForTokenFetch] of [
		["Bearer", undefined],
		["bearer", false],
	] as const) {
		it(`preserves the multipart request for ${scheme} authorization`, async () => {
			const authHeader = `${scheme} storage-token`;
			getAuthHeader.callsFake(async (tokenOptions) => {
				assert.equal(tokenOptions.request?.method, "POST");
				return authHeader;
			});
			await downloadSnapshot(
				resolved,
				getAuthHeader,
				{ refresh: false },
				undefined,
				{ blobs: 2, timeout: 2000 },
				undefined,
				undefined,
				undefined,
				epochTracker,
				undefined,
				undefined,
				useEffectiveMethodForTokenFetch,
			);

			assert(fetchStub.calledOnce);
			assert(getAuthHeader.calledOnce);
			const [url, options] = fetchStub.firstCall.args;
			assert(typeof url === "string" && options !== undefined);
			assert.deepEqual(getAuthHeader.firstCall.args[0].request, {
				url,
				method: "POST",
			});
			assert.equal(options.method, "POST");
			assert.equal(new URL(url).searchParams.get("ump"), "1");
			assert.equal(new URL(url).searchParams.get("blobs"), "2");
			assert.equal(new URL(url).searchParams.has("timeout"), false);
			const headers = new Headers(options.headers);
			assert.match(headers.get("content-type") ?? "", /^multipart\/form-data;boundary=/);
			assert.equal(headers.has("authorization"), false);
			assert.equal(headers.get("x-agent-id"), "snapshot-agent");
			assert(typeof options.body === "string");
			for (const entry of [
				`Authorization: ${authHeader}`,
				"X-HTTP-Method-Override: GET",
				"prefer: manualredirect",
				`sl: ${sharingLink}`,
				"x-fluid-epoch: epoch1",
				`${ClpCompliantAppHeader.isClpCompliantApp}: true`,
			]) {
				assert(options.body.includes(entry), `Multipart body should contain ${entry}`);
			}
		});
	}

	for (const useEpochTracker of [false, true]) {
		it(`authorizes the multipart GET once with epoch tracker ${useEpochTracker}`, async () => {
			resolved.shareLinkInfo = {
				sharingLinkToRedeem: sharingLink,
				isRedemptionNonDurable: useEpochTracker,
			};
			const tokenFetchOptions = {
				refresh: true,
				claims: "claims-challenge",
				tenantId: "tenant",
			};
			const controller = new AbortController();
			const result = await downloadSnapshot(
				resolved,
				getAuthHeader,
				tokenFetchOptions,
				["group-a", "group b"],
				{ blobs: 2, deltas: 1, timeout: 2000 },
				undefined,
				useEpochTracker ? SnapshotFormatSupportType.Binary : undefined,
				controller,
				useEpochTracker ? epochTracker : undefined,
				"snapshot-test",
				hostHeaders,
				true,
			);

			assert(fetchStub.calledOnce);
			assert(getAuthHeader.calledOnce);
			const [url, options] = fetchStub.firstCall.args;
			assert(typeof url === "string" && options !== undefined);
			assert.equal(options.method, "POST");
			assert(typeof options.body === "string");
			assert.equal(options.signal, controller.signal);
			assert.equal(result.requestUrl, url);
			const parsedUrl = new URL(url);
			assert.equal(parsedUrl.searchParams.get("ump"), "1");
			assert.equal(parsedUrl.searchParams.get("blobs"), "2");
			assert.equal(parsedUrl.searchParams.get("deltas"), "1");
			assert.equal(parsedUrl.searchParams.get("groupId"), "group-a,group b");
			assert.equal(parsedUrl.searchParams.has("timeout"), false);
			assert.deepEqual(getAuthHeader.firstCall.args[0], {
				...tokenFetchOptions,
				request: { url, method: "GET" },
			});

			const headers = new Headers(options.headers);
			assert.equal(headers.has("authorization"), false);
			assert.match(headers.get("content-type") ?? "", /^multipart\/form-data;boundary=/);
			assert.equal(headers.has("x-http-method-override"), false);
			for (const entry of [
				`Authorization: MSAuth1.0 popToken="GET ${url}", type="AT_POP"`,
				"X-HTTP-Method-Override: GET",
				`sl: ${sharingLink}`,
				`prefer: ${useEpochTracker ? "manualredirect, nonDurableRedeem" : "manualredirect"}`,
				`${ClpCompliantAppHeader.isClpCompliantApp}: true`,
			]) {
				assert(options.body.includes(entry), `Multipart body should contain ${entry}`);
			}
			assert.equal(headers.get("x-agent-id"), "snapshot-agent");
			assert.equal(
				headers.get("accept"),
				`${useEpochTracker ? "" : "application/json, "}application/ms-fluid; v=${currentReadVersion}`,
			);
			if (useEpochTracker) {
				assert(options.body.includes("x-fluid-epoch: epoch1"));
				assert(options.body.includes("snapshot-test"));
			}
		});
	}

	for (const useEffectiveMethodForTokenFetch of [false, true]) {
		it(`refreshes authorization once with effective-method opt-in ${useEffectiveMethodForTokenFetch}`, async () => {
			const method = useEffectiveMethodForTokenFetch ? "GET" : "POST";
			const claims = '{"access_token":{"auth_time":{"essential":true}}}';
			const tenantId = "test-tenant";
			fetchStub.onFirstCall().resolves(
				new Response(undefined, {
					status: 401,
					headers: {
						"www-authenticate": `Bearer realm="${tenantId}", error="insufficient_claims", claims="${fromUtf8ToBase64(claims)}"`,
					},
				}),
			);

			await getWithRetryForTokenRefresh(async (options) =>
				downloadSnapshot(
					resolved,
					getAuthHeader,
					options,
					undefined,
					{ blobs: 2 },
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					undefined,
					useEffectiveMethodForTokenFetch,
				),
			);

			assert(fetchStub.calledTwice);
			assert(getAuthHeader.calledTwice);
			assert.equal(getAuthHeader.firstCall.args[0].refresh, false);
			assert.equal(getAuthHeader.secondCall.args[0].refresh, true);
			assert.equal(getAuthHeader.secondCall.args[0].claims, claims);
			assert.equal(getAuthHeader.secondCall.args[0].tenantId, tenantId);
			for (const [index, call] of getAuthHeader.getCalls().entries()) {
				const [url, options] = fetchStub.getCall(index).args;
				assert(typeof url === "string" && options !== undefined);
				assert.deepEqual(call.args[0].request, { url, method });
				assert.equal(options.method, "POST");
				assert.equal(new URL(url).searchParams.get("ump"), "1");
				assert(typeof options.body === "string");
				assert(
					options.body.includes(
						`Authorization: MSAuth1.0 popToken="${method} ${url}", type="AT_POP"`,
					),
				);
			}
		});
	}

	it("does not send a request if authorization fails", async () => {
		const error = new Error("Could not authorize the snapshot request");
		getAuthHeader.rejects(error);
		await assert.rejects(
			downloadSnapshot(resolved, getAuthHeader, { refresh: false }, undefined, undefined),
			(candidate: unknown) => candidate === error,
		);
		assert(getAuthHeader.calledOnce);
		assert(fetchStub.notCalled);
	});
});

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
		hostProvidedRequestHeaders: { "X-Agent-Id": "snapshot-agent" },
	};

	const resolver = new OdspDriverUrlResolver();
	const nonPersistentCache = new NonPersistentCache();
	let logger: TelemetryLoggerExt & ITelemetryLoggerExt;
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
			const getDownloadSnapshotStub = stub(downloadSnapshot, mockify.key);
			getDownloadSnapshotStub.returns(_response);
			try {
				return await callback();
			} finally {
				assert(
					getDownloadSnapshotStub.args[0][4]?.mds === undefined,
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
			const getDownloadSnapshotStub = stub(downloadSnapshot, mockify.key);
			getDownloadSnapshotStub.returns(_response);
			try {
				return await callback();
			} finally {
				getDownloadSnapshotStub.restore();
			}
		}
		const odspResponse: IOdspResponse<Response> = {
			content: (await createResponse({}, new Uint8Array().buffer, 200)) as unknown as Response,
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
			const getDownloadSnapshotStub = stub(downloadSnapshot, mockify.key);
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
			const getDownloadSnapshotStub = stub(downloadSnapshot, mockify.key);
			getDownloadSnapshotStub.returns(_response);
			try {
				return await callback();
			} finally {
				getDownloadSnapshotStub.restore();
				assert(
					getDownloadSnapshotStub.args[0][3]?.length === 0,
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
		const cachedValue = (await epochTracker.get(
			createCacheSnapshotKey(resolved, false),
		)) as ISnapshot;
		const cachedValueWithLoadingGroupId = (await epochTracker.get(
			createCacheSnapshotKey(resolved, true),
		)) as ISnapshot;
		assert(cachedValueWithLoadingGroupId === undefined, "snapshot should not exist");
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
			const getDownloadSnapshotStub = stub(downloadSnapshot, mockify.key);
			getDownloadSnapshotStub.returns(_response);
			try {
				return await callback();
			} finally {
				getDownloadSnapshotStub.restore();
				assert(getDownloadSnapshotStub.args[0][3]?.[0] === "g1", "should ask for g1 groupId");
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
			const getDownloadSnapshotStub = stub(downloadSnapshot, mockify.key);
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
		const cachedValue = (await epochTracker.get(
			createCacheSnapshotKey(resolved, false),
		)) as ISnapshot;
		assert(cachedValue.snapshotTree.id === "SnapshotId", "snapshot should have been cached");
		assert(service["blobCache"].value.size > 0, "blobs should still be cached locally");
		assert(service["commitCache"].size === 0, "no trees should be cached");
	});

	it("GetSnapshot() should not consult cache when request is for a loading group", async () => {
		async function mockDownloadSnapshot<T>(
			_response: Promise<ISnapshotRequestAndResponseOptions>,
			callback: () => Promise<T>,
		): Promise<T> {
			const getDownloadSnapshotStub = stub(downloadSnapshot, mockify.key);
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
						async (headers): Promise<MockResponse> => {
							assert.strictEqual(headers?.["x-agent-id"], "snapshot-agent");
							return okResponse({}, {});
						},
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
				{
					eventName: "RedeemShareLink_end",
					details:
						'{"shareLinkUrlLength":45,"queryParamsLength":0,"useHeaders":true,"isRedemptionNonDurable":false}',
				},
				{ eventName: "RedeemFallback", errorType: "fileNotFoundOrAccessDeniedError" },
				{ eventName: "TreesLatest_end" },
			]),
		);
	});

	it("nonDurableRedeem header is set during RedeemFallback behavior", async () => {
		resolved.shareLinkInfo = {
			sharingLinkToRedeem: "https://microsoft.sharepoint-df.com/sharelink",
			isRedemptionNonDurable: true,
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
				{
					eventName: "RedeemShareLink_end",
					details:
						'{"shareLinkUrlLength":45,"queryParamsLength":0,"useHeaders":true,"isRedemptionNonDurable":true}',
				},
				{ eventName: "RedeemFallback", errorType: "fileNotFoundOrAccessDeniedError" },
				{ eventName: "TreesLatest_end" },
			]),
		);
	});

	it("Redeem sharing link on location redirection error", async () => {
		resolved.shareLinkInfo = {
			sharingLinkToRedeem: "https://microsoft.sharepoint-df.com/sharelink",
		};

		const newSiteUrl = "https://microsoft.sharepoint.com/siteUrl";

		try {
			await mockFetchMultiple(
				async () => service.getSnapshot({}),
				[
					// First fetch (trees/latest) returns 404 with redirectLocation
					async (): Promise<MockResponse> =>
						createResponse(
							{ "x-fluid-epoch": "epoch1" },
							{
								error: {
									"message": "locationMoved",
									"@error.redirectLocation": newSiteUrl,
								},
							},
							404,
						),
					// Second fetch is the redeem /shares API call
					async (): Promise<MockResponse> => okResponse({}, {}),
				],
			);
			assert.fail("Should have thrown a locationRedirection error");
		} catch (error: unknown) {
			assert.strictEqual(
				(error as Partial<IFluidErrorBase>).errorType,
				DriverErrorTypes.locationRedirection,
				"Error should be a locationRedirection error",
			);
		}
		assert(
			mockLogger.matchEvents([
				{ eventName: "TreesLatest_cancel" },
				{ eventName: "RedirectRedeemFallback" },
				{
					eventName: "RedeemShareLink_end",
					details:
						'{"shareLinkUrlLength":45,"queryParamsLength":0,"useHeaders":true,"isRedemptionNonDurable":false}',
				},
			]),
			"Should have redeemed sharing link before re-throwing the redirection error",
		);
	});

	it("Location redirection error without shareLink skips redeem", async () => {
		// No shareLinkInfo set on resolved URL
		delete resolved.shareLinkInfo;

		const newSiteUrl = "https://microsoft.sharepoint.com/siteUrl";

		try {
			await mockFetchMultiple(
				async () => service.getSnapshot({}),
				[
					async (): Promise<MockResponse> =>
						createResponse(
							{ "x-fluid-epoch": "epoch1" },
							{
								error: {
									"message": "locationMoved",
									"@error.redirectLocation": newSiteUrl,
								},
							},
							404,
						),
				],
			);
			assert.fail("Should have thrown a locationRedirection error");
		} catch (error: unknown) {
			assert.strictEqual(
				(error as Partial<IFluidErrorBase>).errorType,
				DriverErrorTypes.locationRedirection,
				"Error should be a locationRedirection error",
			);
		}
		assert(
			!mockLogger.matchAnyEvent([{ eventName: "RedeemShareLink_end" }]),
			"Should not have attempted redeem without a shareLink",
		);
		assert(
			!mockLogger.matchAnyEvent([{ eventName: "RedirectRedeemFallback" }]),
			"Should not have logged redirect redeem fallback without a shareLink",
		);
	});

	it("SnapshotAuthHeaderObtained and SnapshotFetchResponseReceived events are logged on snapshot fetch", async () => {
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

		await mockFetchMultiple(
			async () => service.getSnapshot({}),
			[async (): Promise<Response> => response],
		);

		mockLogger.assertMatch(
			[
				{ eventName: "SnapshotAuthHeaderObtained" },
				{ eventName: "SnapshotFetchResponseReceived" },
			],
			"SnapshotAuthHeaderObtained and SnapshotFetchResponseReceived events should be logged on snapshot fetch",
		);
	});

	it("Location redirection error still throws when redeem fails", async () => {
		resolved.shareLinkInfo = {
			sharingLinkToRedeem: "https://microsoft.sharepoint-df.com/sharelink",
		};

		const newSiteUrl = "https://microsoft.sharepoint.com/siteUrl";

		try {
			await mockFetchMultiple(
				async () => service.getSnapshot({}),
				[
					// First fetch (trees/latest) returns 404 with redirectLocation
					async (): Promise<MockResponse> =>
						createResponse(
							{ "x-fluid-epoch": "epoch1" },
							{
								error: {
									"message": "locationMoved",
									"@error.redirectLocation": newSiteUrl,
								},
							},
							404,
						),
					// Second fetch is the redeem /shares API call - returns failure
					async (): Promise<MockResponse> =>
						createResponse({}, { error: "redeemFailed" }, 500),
				],
			);
			assert.fail("Should have thrown a locationRedirection error");
		} catch (error: unknown) {
			assert.strictEqual(
				(error as Partial<IFluidErrorBase>).errorType,
				DriverErrorTypes.locationRedirection,
				"Original redirection error should be thrown even when redeem fails",
			);
		}
		assert(
			mockLogger.matchAnyEvent([{ eventName: "RedirectRedeemFallbackError" }]),
			"Should have logged redeem failure telemetry",
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
