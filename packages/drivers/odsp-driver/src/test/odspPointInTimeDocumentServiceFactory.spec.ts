/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IDocumentService,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import type {
	IOdspResolvedUrl,
	OdspResourceTokenFetchOptions,
	TokenFetcher,
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
});
