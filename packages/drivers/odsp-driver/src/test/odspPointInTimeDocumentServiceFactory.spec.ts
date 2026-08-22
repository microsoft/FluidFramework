/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IDocumentService } from "@fluidframework/driver-definitions/internal";
import {
	OdspErrorTypes,
	type IOdspResolvedUrl,
	type OdspResourceTokenFetchOptions,
	type TokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

import { EpochTracker, type ICacheAndTracker } from "../epochTracker.js";
import { LocalPersistentCache } from "../odspCache.js";
import {
	createLocalOdspDocumentServiceFactory,
	getOdspPointInTimeDocumentServiceFactory,
	OdspDocumentServiceFactory,
} from "../odspDocumentServiceFactory.js";
import { getHashedDocumentId } from "../odspPublicUtils.js";
import {
	createPointInTimeDocumentService,
	createVersionManager,
	type ICreatePointInTimeDocumentServiceProps,
	resolveFileVersion,
	// eslint-disable-next-line import-x/no-internal-modules -- test targets the lazy point-in-time module directly
} from "../pointInTimeDriver/createPointInTimeDocumentService.js";
// eslint-disable-next-line import-x/no-internal-modules -- test targets the point-in-time driver directly
import { OdspPointInTimeDocumentService } from "../pointInTimeDriver/odspPointInTimeDocumentService.js";
import type { BaseForSeq, IOdspVersionManager } from "../odspVersionManager/index.js";
import {
	OdspVersionManager,
	type IOdspFileVersionFetcher,
	// eslint-disable-next-line import-x/no-internal-modules -- test drives a real OdspVersionManager through the factory
} from "../odspVersionManager/odspVersionManager.js";

/**
 * Tests for the point-in-time factory's **lineage guard**: it materializes a document by replaying
 * the live document's ops in `(base, target]` on top of a recoverable base file version. That is only
 * correct while the base version and the live document are on the same lineage (ODSP epoch). A version
 * restore (or download-then-reupload) bumps the epoch and renumbers the op stream, so replaying live
 * ops onto a pre-restore base would silently corrupt the result.
 *
 * The guard is structural: a single {@link EpochTracker} is shared across the version-history reads,
 * the recoverable base snapshot, and the live op reads. ODSP stamps every response with the file's
 * epoch and the tracker throws on divergence - so a cross-lineage read fails loudly instead of
 * producing a wrong document.
 */
describe("OdspPointInTimeDocumentServiceFactory lineage guard", () => {
	const siteUrl = "https://microsoft.sharepoint.com";
	const driveId = "driveId";
	const itemId = "itemId";

	const getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions> = async () => "******";

	it("exposes one prototype capability on the standard factory and compatibility helper", () => {
		const factory = new OdspDocumentServiceFactory(getStorageToken, undefined);
		assert.equal(typeof factory.createPointInTimeDocumentService, "function");
		assert.equal(
			Object.hasOwn(factory, "createPointInTimeDocumentService"),
			false,
			"the capability is a prototype method, not an instance field",
		);
		assert.ok(
			getOdspPointInTimeDocumentServiceFactory(getStorageToken, undefined) instanceof
				OdspDocumentServiceFactory,
		);
	});

	it("does not expose point-in-time loading on the local factory", () => {
		const factory = createLocalOdspDocumentServiceFactory(new Uint8Array());
		assert.equal(
			(factory as { createPointInTimeDocumentService?: unknown })
				.createPointInTimeDocumentService,
			undefined,
		);
	});

	/** A minimal ODSP-shaped resolved URL sufficient for `getOdspResolvedUrl`. */
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

	/** A fake document service that satisfies what `OdspPointInTimeDocumentService` calls on it. */
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

	/**
	 * A fake {@link IOdspFileVersionFetcher} for driving a *real* {@link OdspVersionManager} through the
	 * factory, so `findBaseForSeq`'s lineage check - the recoverable-version-epoch vs
	 * live-document-epoch comparison - runs for real instead of being stubbed out. The timeline is
	 * tip=seq 10, recoverable version "42.0"=seq 5, so a target of 8 selects "42.0" as the base.
	 */
	function fakeFetcher(config: {
		liveEpoch?: string;
		versionEpoch?: string;
	}): IOdspFileVersionFetcher {
		return {
			listFileVersions: async () => [
				{ versionId: "tip", lastModifiedDateTime: "2026-01-01T00:00:00Z" },
				{ versionId: "42.0", lastModifiedDateTime: "2026-01-01T00:00:00Z" },
			],
			resolveSequenceNumber: async (versionId: string) => (versionId === "tip" ? 10 : 5),
			getLiveDocumentEpoch: async () => config.liveEpoch,
			getRecoverableVersionEpoch: async () => config.versionEpoch,
		};
	}

	function makeProps(
		resolvedUrl: IOdspResolvedUrl,
		overrides: Partial<ICreatePointInTimeDocumentServiceProps> = {},
	): ICreatePointInTimeDocumentServiceProps {
		return {
			resolvedUrl,
			targetSequenceNumber: 8,
			persistedCache: new LocalPersistentCache(),
			getStorageToken,
			createDocumentService: async () => fakeDocumentService(),
			...overrides,
		};
	}

	it("shares one epoch tracker across the version manager and both document services", async () => {
		const resolvedUrl = await makeResolvedUrl();
		const recoverableResolvedUrl = await makeResolvedUrl("42.0");

		let versionManagerEpochTracker: EpochTracker | undefined;
		const fakeManager: IOdspVersionManager = {
			findBaseForSeq: async (): Promise<BaseForSeq> => ({
				kind: "found",
				base: {
					versionId: "42.0",
					sequenceNumber: 5,
					lastModifiedDateTime: "2026-01-01T00:00:00Z",
				},
			}),
		};
		const capturedCacheAndTrackers: (ICacheAndTracker | undefined)[] = [];
		const result = await createPointInTimeDocumentService(
			makeProps(resolvedUrl, {
				targetSequenceNumber: 5,
				dependencies: {
					createVersionManager: (_url, _logger, epochTracker) => {
						versionManagerEpochTracker = epochTracker;
						return fakeManager;
					},
					resolveFileVersion: () => recoverableResolvedUrl,
				},
				createDocumentService: async (_url, _logger, cacheAndTracker) => {
					capturedCacheAndTrackers.push(cacheAndTracker);
					return fakeDocumentService();
				},
			}),
		);
		assert.ok(
			result instanceof OdspPointInTimeDocumentService,
			"a point-in-time document service is returned",
		);

		assert.equal(
			capturedCacheAndTrackers.length,
			2,
			"a recoverable (base version) and a live document service are created",
		);
		const [recoverable, live] = capturedCacheAndTrackers;
		assert.ok(
			recoverable !== undefined,
			"the recoverable service receives a shared cache-and-tracker",
		);
		assert.equal(
			recoverable,
			live,
			"the recoverable and live services share the SAME cache-and-tracker instance",
		);
		assert.equal(
			versionManagerEpochTracker,
			recoverable.epochTracker,
			"the version manager reads through the same epoch tracker as the two services",
		);
	});

	it("a shared epoch tracker rejects a live read from a divergent lineage (restore/epoch bump)", async () => {
		const hashedDocumentId = await getHashedDocumentId(driveId, itemId);
		const resolvedUrl = await makeResolvedUrl();
		const tracker = new EpochTracker(
			new LocalPersistentCache(),
			{ docId: hashedDocumentId, resolvedUrl },
			createChildLogger(),
		);

		// The base version read pins the shared tracker to the pre-restore epoch "A".
		tracker.setEpoch("epoch-A", false, "treesLatest");

		// After a restore the file is on epoch "B"; a live op read carries "B" through the SAME tracker.
		// The guard rejects it rather than replaying epoch-B ops onto the epoch-A base snapshot.
		await assert.rejects(
			async () => tracker.validateEpoch("epoch-B", "ops"),
			/epoch mismatch/i,
		);

		// A same-lineage read (still epoch "A") is accepted.
		await tracker.validateEpoch("epoch-A", "ops");

		await tracker.removeEntries().catch(() => {});
	});

	it("fails the load (before creating any service) when the recoverable version's epoch differs from the live document's", async () => {
		const resolvedUrl = await makeResolvedUrl();

		// A REAL version manager backed by a fake fetcher whose recoverable-version epoch ("epoch-old")
		// differs from the live document's ("epoch-live"). This is what makes findBaseForSeq run the
		// actual recoverable-vs-live lineage comparison, rather than a stubbed no-op.
		const realManager = new OdspVersionManager(
			fakeFetcher({ liveEpoch: "epoch-live", versionEpoch: "epoch-old" }),
		);
		let resolveFileVersionCallCount = 0;
		let createDocumentServiceCallCount = 0;

		await assert.rejects(
			async () =>
				createPointInTimeDocumentService(
					makeProps(resolvedUrl, {
						dependencies: {
							createVersionManager: () => realManager,
							resolveFileVersion: () => {
								resolveFileVersionCallCount++;
								return resolvedUrl;
							},
						},
						createDocumentService: async () => {
							createDocumentServiceCallCount++;
							return fakeDocumentService();
						},
					}),
				),
			(error: Error) => {
				assert.match(error.message, /epoch "epoch-old".*epoch "epoch-live"/);
				assert.equal(
					(error as Partial<{ errorType: string }>).errorType,
					OdspErrorTypes.fileOverwrittenInStorage,
					"a cross-lineage base surfaces the driver's fileOverwrittenInStorage error",
				);
				return true;
			},
			"a cross-lineage base must fail the load with the epoch-mismatch error",
		);
		// The lineage check runs BEFORE any base resolution or service creation, so a mismatch must
		// short-circuit the whole load.
		assert.equal(
			resolveFileVersionCallCount,
			0,
			"the base version must not be resolved once the lineage check fails",
		);
		assert.equal(
			createDocumentServiceCallCount,
			0,
			"no document service should be created once the lineage check fails",
		);
	});

	it("materializes the document (creating both services) when the recoverable version shares the live document's epoch", async () => {
		const resolvedUrl = await makeResolvedUrl();
		const recoverableResolvedUrl = await makeResolvedUrl("42.0");

		// Same epoch on both sides, so findBaseForSeq's lineage check passes and the
		// factory proceeds to build the two services.
		const realManager = new OdspVersionManager(
			fakeFetcher({ liveEpoch: "epoch-A", versionEpoch: "epoch-A" }),
		);
		let createDocumentServiceCallCount = 0;
		const result = await createPointInTimeDocumentService(
			makeProps(resolvedUrl, {
				dependencies: {
					createVersionManager: () => realManager,
					resolveFileVersion: () => recoverableResolvedUrl,
				},
				createDocumentService: async () => {
					createDocumentServiceCallCount++;
					return fakeDocumentService();
				},
			}),
		);
		assert.ok(
			result instanceof OdspPointInTimeDocumentService,
			"a point-in-time document service is returned once the lineage check passes",
		);
		assert.equal(
			createDocumentServiceCallCount,
			2,
			"a recoverable and a live document service are created once validation passes",
		);
	});

	for (const oldestResolvedSeq of [undefined, 5]) {
		it(`reports when no recoverable base exists${
			oldestResolvedSeq === undefined
				? ""
				: " and includes the oldest available sequence number"
		}`, async () => {
			const resolvedUrl = await makeResolvedUrl();
			let resolveFileVersionCallCount = 0;
			let createDocumentServiceCallCount = 0;

			await assert.rejects(
				async () =>
					createPointInTimeDocumentService(
						makeProps(resolvedUrl, {
							targetSequenceNumber: 4,
							dependencies: {
								createVersionManager: () => ({
									findBaseForSeq: async (): Promise<BaseForSeq> =>
										oldestResolvedSeq === undefined
											? { kind: "noBaseVersion" }
											: { kind: "noBaseVersion", oldestResolvedSeq },
								}),
								resolveFileVersion: () => {
									resolveFileVersionCallCount++;
									return resolvedUrl;
								},
							},
							createDocumentService: async () => {
								createDocumentServiceCallCount++;
								return fakeDocumentService();
							},
						}),
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
			assert.equal(resolveFileVersionCallCount, 0);
			assert.equal(createDocumentServiceCallCount, 0);
		});
	}

	it("builds the concrete version manager and preserves URL metadata when resolving a base version", async () => {
		const resolvedUrl: IOdspResolvedUrl = {
			...(await makeResolvedUrl()),
			dataStorePath: "/data/store",
			codeHint: { containerPackageName: "test-package" },
		};
		const tracker = new EpochTracker(
			new LocalPersistentCache(),
			{ docId: resolvedUrl.hashedDocumentId, resolvedUrl },
			createChildLogger(),
		);

		const manager = createVersionManager(
			resolvedUrl,
			createChildLogger(),
			tracker,
			getStorageToken,
		);
		assert.equal(typeof manager.findBaseForSeq, "function");

		const versionedUrl = resolveFileVersion(resolvedUrl, "42.0");
		assert.equal(versionedUrl.fileVersion, "42.0");
		assert.equal(versionedUrl.dataStorePath, "/data/store");
		assert.equal(versionedUrl.codeHint?.containerPackageName, "test-package");

		await tracker.removeEntries().catch(() => {});
	});
});
