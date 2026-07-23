/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IDocumentService,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import {
	OdspErrorTypes,
	type IOdspResolvedUrl,
	type OdspResourceTokenFetchOptions,
	type TokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import { stub } from "sinon";

import { EpochTracker, type ICacheAndTracker } from "../epochTracker.js";
import { LocalPersistentCache } from "../odspCache.js";
import { getHashedDocumentId } from "../odspPublicUtils.js";
// eslint-disable-next-line import-x/no-internal-modules -- test targets the point-in-time driver directly
import { OdspPointInTimeDocumentService } from "../pointInTimeDriver/odspPointInTimeDocumentService.js";
// eslint-disable-next-line import-x/no-internal-modules -- test targets the point-in-time driver directly
import { OdspPointInTimeDocumentServiceFactory } from "../pointInTimeDriver/odspPointInTimeDocumentServiceFactory.js";
import type { BaseForSeq, IOdspVersionManager } from "../odspVersionManager/index.js";
/* eslint-disable import-x/no-internal-modules --
   test drives a real OdspVersionManager through the factory */
import {
	OdspVersionManager,
	type IOdspFileVersionFetcher,
} from "../odspVersionManager/odspVersionManager.js";
/* eslint-enable import-x/no-internal-modules */

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
	 * factory, so the factory's up-front `validateBaseForReplay` - the recoverable-version-epoch vs
	 * live-document-epoch comparison - runs for real instead of being stubbed out. The timeline is
	 * tip=seq 10, recoverable version "42.0"=seq 5, so a target of 8 selects "42.0" as the base.
	 */
	function fakeFetcher(config: {
		liveEpoch?: string;
		versionEpoch?: string;
		retainedOps?: number[];
	}): IOdspFileVersionFetcher {
		const retainedOps = config.retainedOps ?? [];
		return {
			listFileVersions: async () => [
				{ versionId: "tip", lastModifiedDateTime: "2026-01-01T00:00:00Z" },
				{ versionId: "42.0", lastModifiedDateTime: "2026-01-01T00:00:00Z" },
			],
			resolveSequenceNumber: async (versionId: string) => (versionId === "tip" ? 10 : 5),
			getLiveDocumentEpoch: async () => config.liveEpoch,
			getRecoverableVersionEpoch: async () => config.versionEpoch,
			fetchOps: async (from: number, to: number) =>
				retainedOps.filter((seq) => seq >= from && seq < to),
		};
	}

	/** The private seams the factory composes, reached past the class's non-public surface. */
	interface FactoryInternals {
		createVersionManager: (
			odspResolvedUrl: IOdspResolvedUrl,
			logger: unknown,
			epochTracker: EpochTracker,
		) => IOdspVersionManager;
		resolveFileVersion: (
			resolvedUrl: IResolvedUrl,
			fileVersion: string,
		) => Promise<IResolvedUrl>;
		createDocumentServiceCore: (
			resolvedUrl: IResolvedUrl,
			logger: unknown,
			cacheAndTracker?: ICacheAndTracker,
		) => Promise<IDocumentService>;
	}

	it("shares one epoch tracker across the version manager and both document services", async () => {
		const factory = new OdspPointInTimeDocumentServiceFactory(getStorageToken, undefined);
		const resolvedUrl = await makeResolvedUrl();
		const recoverableResolvedUrl = await makeResolvedUrl("42.0");

		// Reach past the private/protected surface to stub the three seams the method composes.
		const internals = factory as unknown as {
			createVersionManager: (
				odspResolvedUrl: IOdspResolvedUrl,
				logger: unknown,
				epochTracker: EpochTracker,
			) => IOdspVersionManager;
			resolveFileVersion: (
				resolvedUrl: IResolvedUrl,
				fileVersion: string,
			) => Promise<IResolvedUrl>;
			createDocumentServiceCore: (
				resolvedUrl: IResolvedUrl,
				logger: unknown,
				cacheAndTracker?: ICacheAndTracker,
			) => Promise<IDocumentService>;
		};

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
			validateBaseForReplay: async (): Promise<void> => {},
		};
		stub(internals, "createVersionManager").callsFake((_url, _logger, epochTracker) => {
			versionManagerEpochTracker = epochTracker;
			return fakeManager;
		});
		stub(internals, "resolveFileVersion").resolves(recoverableResolvedUrl);

		const capturedCacheAndTrackers: (ICacheAndTracker | undefined)[] = [];
		stub(internals, "createDocumentServiceCore").callsFake(
			async (_url, _logger, cacheAndTracker) => {
				capturedCacheAndTrackers.push(cacheAndTracker);
				return fakeDocumentService();
			},
		);

		const result = await factory.createPointInTimeDocumentService(resolvedUrl, 5);
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
		const factory = new OdspPointInTimeDocumentServiceFactory(getStorageToken, undefined);
		const resolvedUrl = await makeResolvedUrl();
		const internals = factory as unknown as FactoryInternals;

		// A REAL version manager backed by a fake fetcher whose recoverable-version epoch ("epoch-old")
		// differs from the live document's ("epoch-live"). This is what makes the factory run the actual
		// recoverable-vs-live comparison in validateBaseForReplay, rather than a stubbed no-op.
		const realManager = new OdspVersionManager(
			fakeFetcher({ liveEpoch: "epoch-live", versionEpoch: "epoch-old" }),
		);
		stub(internals, "createVersionManager").returns(realManager);
		const resolveFileVersion = stub(internals, "resolveFileVersion");
		const createDocumentServiceCore = stub(internals, "createDocumentServiceCore");

		await assert.rejects(
			async () => factory.createPointInTimeDocumentService(resolvedUrl, 8),
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
		assert.ok(
			resolveFileVersion.notCalled,
			"the base version must not be resolved once the lineage check fails",
		);
		assert.ok(
			createDocumentServiceCore.notCalled,
			"no document service should be created once the lineage check fails",
		);
	});

	it("fails the load (before creating any service) when the ops needed to reach the target are missing", async () => {
		const factory = new OdspPointInTimeDocumentServiceFactory(getStorageToken, undefined);
		const resolvedUrl = await makeResolvedUrl();
		const internals = factory as unknown as FactoryInternals;

		// Same lineage on both sides so the epoch check passes, but the op stream that bridges the base
		// (seq 5) to the target (seq 8) has a hole: 6 and 8 are retained, 7 was trimmed. The load must
		// fail on the op-availability check rather than materialize a document with a missing op.
		const realManager = new OdspVersionManager(
			fakeFetcher({ liveEpoch: "epoch-A", versionEpoch: "epoch-A", retainedOps: [6, 8] }),
		);
		stub(internals, "createVersionManager").returns(realManager);
		const resolveFileVersion = stub(internals, "resolveFileVersion");
		const createDocumentServiceCore = stub(internals, "createDocumentServiceCore");

		await assert.rejects(
			async () => factory.createPointInTimeDocumentService(resolvedUrl, 8),
			/expected sequence number 7 but the next available op is 8/,
			"a gap in (base, target] must fail the load",
		);
		// The op check runs before base resolution and service creation, so a gap short-circuits the load.
		assert.ok(
			resolveFileVersion.notCalled,
			"the base version must not be resolved once the op check fails",
		);
		assert.ok(
			createDocumentServiceCore.notCalled,
			"no document service should be created once the op check fails",
		);
	});

	it("fails the load when op retention has trimmed everything after the base (no ops available)", async () => {
		const factory = new OdspPointInTimeDocumentServiceFactory(getStorageToken, undefined);
		const resolvedUrl = await makeResolvedUrl();
		const internals = factory as unknown as FactoryInternals;

		// Same lineage, but the base (seq 5) is older than the retention window: no op in (5, 8] survives.
		const realManager = new OdspVersionManager(
			fakeFetcher({ liveEpoch: "epoch-A", versionEpoch: "epoch-A", retainedOps: [] }),
		);
		stub(internals, "createVersionManager").returns(realManager);
		const createDocumentServiceCore = stub(internals, "createDocumentServiceCore");

		await assert.rejects(
			async () => factory.createPointInTimeDocumentService(resolvedUrl, 8),
			/no ops at or after sequence number 6/,
			"a fully trimmed op range must fail the load",
		);
		assert.ok(
			createDocumentServiceCore.notCalled,
			"no document service should be created once the op check fails",
		);
	});

	it("materializes the document (creating both services) when the recoverable version shares the live document's epoch", async () => {
		const factory = new OdspPointInTimeDocumentServiceFactory(getStorageToken, undefined);
		const resolvedUrl = await makeResolvedUrl();
		const recoverableResolvedUrl = await makeResolvedUrl("42.0");
		const internals = factory as unknown as FactoryInternals;

		// Same epoch on both sides, and every op in (5, 8] retained, so the real validateBaseForReplay
		// passes and the factory proceeds to build the two services.
		const realManager = new OdspVersionManager(
			fakeFetcher({ liveEpoch: "epoch-A", versionEpoch: "epoch-A", retainedOps: [6, 7, 8] }),
		);
		stub(internals, "createVersionManager").returns(realManager);
		stub(internals, "resolveFileVersion").resolves(recoverableResolvedUrl);
		const createDocumentServiceCore = stub(internals, "createDocumentServiceCore").callsFake(
			async () => fakeDocumentService(),
		);

		const result = await factory.createPointInTimeDocumentService(resolvedUrl, 8);
		assert.ok(
			result instanceof OdspPointInTimeDocumentService,
			"a point-in-time document service is returned once the lineage check passes",
		);
		assert.equal(
			createDocumentServiceCore.callCount,
			2,
			"a recoverable and a live document service are created once validation passes",
		);
	});
});
