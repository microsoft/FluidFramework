/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IDocumentService } from "@fluidframework/driver-definitions/internal";
import type {
	IOdspResolvedUrl,
	OdspResourceTokenFetchOptions,
	TokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

import { EpochTracker, type ICacheAndTracker } from "../epochTracker.js";
import { LocalPersistentCache } from "../odspCache.js";
import {
	createLocalOdspDocumentServiceFactory,
	createOdspDocumentServiceFactory,
} from "../odspDocumentServiceFactory.js";
import type { IOdspPointInTimeDocumentServiceImplementationProps } from "../odspDocumentServiceFactoryCore.js";
import { getHashedDocumentId } from "../odspPublicUtils.js";
import {
	createPointInTimeDocumentServiceCore,
	// eslint-disable-next-line import-x/no-internal-modules -- tests target the feature implementation directly
} from "../pointInTimeDriver/createPointInTimeDocumentService.js";
// eslint-disable-next-line import-x/no-internal-modules -- tests target the composed PIT service directly
import { OdspPointInTimeDocumentService } from "../pointInTimeDriver/odspPointInTimeDocumentService.js";
import type { BaseForSeq, IOdspVersionManager } from "../odspVersionManager/index.js";

describe("OdspPointInTimeDocumentServiceFactory", () => {
	const siteUrl = "https://microsoft.sharepoint.com";
	const driveId = "driveId";
	const itemId = "itemId";
	const getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions> = async () => "******";

	async function makeResolvedUrl(fileVersion?: string): Promise<IOdspResolvedUrl> {
		const hashedDocumentId = await getHashedDocumentId(driveId, itemId);
		return {
			odspResolvedUrl: true,
			siteUrl,
			driveId,
			itemId,
			hashedDocumentId,
			fileVersion,
			dataStorePath: undefined,
		} as unknown as IOdspResolvedUrl;
	}

	function fakeDocumentService(): IDocumentService {
		const service = {
			on() {
				return service;
			},
			off() {
				return service;
			},
			dispose() {},
		};
		return service as unknown as IDocumentService;
	}

	it("does not expose point-in-time loading unless the consumer injects it", () => {
		const factory = createOdspDocumentServiceFactory({
			getStorageToken,
			getWebsocketToken: undefined,
		});
		assert.equal(factory.createPointInTimeDocumentService, undefined);
	});

	it("exposes and invokes the consumer-injected implementation", async () => {
		const resolvedUrl = await makeResolvedUrl();
		const expectedService = fakeDocumentService();
		const persistedCache = new LocalPersistentCache();
		let capturedProps: IOdspPointInTimeDocumentServiceImplementationProps | undefined;
		const factory = createOdspDocumentServiceFactory({
			getStorageToken,
			getWebsocketToken: undefined,
			persistedCache,
			pointInTimeDocumentServiceImplementation: async (props) => {
				capturedProps = props;
				return expectedService;
			},
		});

		const result = await factory.createPointInTimeDocumentService?.(resolvedUrl, 42);
		assert.equal(result, expectedService);
		assert.equal(capturedProps?.resolvedUrl, resolvedUrl);
		assert.equal(capturedProps?.targetSequenceNumber, 42);
		assert.equal(capturedProps?.getStorageToken, getStorageToken);
		assert.equal(capturedProps?.persistedCache, persistedCache);
		assert.equal(typeof capturedProps?.createDocumentService, "function");
	});

	it("does not expose point-in-time loading on the local factory", () => {
		const factory = createLocalOdspDocumentServiceFactory(new Uint8Array());
		assert.equal(
			(factory as { createPointInTimeDocumentService?: unknown })
				.createPointInTimeDocumentService,
			undefined,
		);
	});

	function makeImplementationProps(
		resolvedUrl: IOdspResolvedUrl,
		createDocumentService: IOdspPointInTimeDocumentServiceImplementationProps["createDocumentService"],
	): IOdspPointInTimeDocumentServiceImplementationProps {
		return {
			resolvedUrl,
			targetSequenceNumber: 8,
			persistedCache: new LocalPersistentCache(),
			getStorageToken,
			createDocumentService,
		};
	}

	it("shares one epoch tracker across version selection and both document services", async () => {
		const resolvedUrl = await makeResolvedUrl();
		const recoverableResolvedUrl = await makeResolvedUrl("42.0");
		let versionManagerEpochTracker: EpochTracker | undefined;
		const manager: IOdspVersionManager = {
			findBaseForSeq: async (): Promise<BaseForSeq> => ({
				kind: "found",
				base: {
					versionId: "42.0",
					sequenceNumber: 5,
					lastModifiedDateTime: "2026-01-01T00:00:00Z",
				},
			}),
		};
		const capturedCacheAndTrackers: ICacheAndTracker[] = [];
		const result = await createPointInTimeDocumentServiceCore(
			makeImplementationProps(resolvedUrl, async (_url, _logger, cacheAndTracker) => {
				capturedCacheAndTrackers.push(cacheAndTracker);
				return fakeDocumentService();
			}),
			{
				createVersionManager: (_url, _logger, epochTracker) => {
					versionManagerEpochTracker = epochTracker;
					return manager;
				},
				resolveFileVersion: () => recoverableResolvedUrl,
			},
		);

		assert.ok(result instanceof OdspPointInTimeDocumentService);
		assert.equal(capturedCacheAndTrackers.length, 2);
		assert.equal(capturedCacheAndTrackers[0], capturedCacheAndTrackers[1]);
		assert.equal(versionManagerEpochTracker, capturedCacheAndTrackers[0]?.epochTracker);
	});

	for (const oldestResolvedSeq of [undefined, 5]) {
		it(`reports when no recoverable base exists${
			oldestResolvedSeq === undefined ? "" : " and includes the oldest sequence"
		}`, async () => {
			const resolvedUrl = await makeResolvedUrl();
			let createDocumentServiceCalls = 0;
			await assert.rejects(
				async () =>
					createPointInTimeDocumentServiceCore(
						makeImplementationProps(resolvedUrl, async () => {
							createDocumentServiceCalls++;
							return fakeDocumentService();
						}),
						{
							createVersionManager: () => ({
								findBaseForSeq: async (): Promise<BaseForSeq> =>
									oldestResolvedSeq === undefined
										? { kind: "noBaseVersion" }
										: { kind: "noBaseVersion", oldestResolvedSeq },
							}),
						},
					),
				(error: Error) => {
					assert.match(error.message, /No ODSP file version is available at or before/);
					if (oldestResolvedSeq === undefined) {
						assert.doesNotMatch(error.message, /oldest resolved file version/);
					} else {
						assert.match(error.message, /oldest resolved file version.*5/);
					}
					return true;
				},
			);
			assert.equal(createDocumentServiceCalls, 0);
		});
	}

	it("the shared epoch tracker rejects reads from a divergent lineage", async () => {
		const resolvedUrl = await makeResolvedUrl();
		const tracker = new EpochTracker(
			new LocalPersistentCache(),
			{ docId: resolvedUrl.hashedDocumentId, resolvedUrl },
			createChildLogger(),
		);
		tracker.setEpoch("epoch-A", false, "treesLatest");
		await assert.rejects(
			async () => tracker.validateEpoch("epoch-B", "ops"),
			/epoch mismatch/i,
		);
		await tracker.validateEpoch("epoch-A", "ops");
		await tracker.removeEntries().catch(() => {});
	});
});
