/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";

import {
	createOdspPointInTimeVersionManagerCore,
	// eslint-disable-next-line import-x/no-internal-modules -- Tests target the lightweight internal selector.
} from "../pointInTimeDriver/odspPointInTimeVersionManager.js";

describe("OdspPointInTimeVersionManager", () => {
	it("selects the closest sealed version despite local sequence inversions", async () => {
		const sequenceNumbers = new Map([
			["newer", 80],
			["inverted", 90],
			["older", 50],
		]);
		const manager = createOdspPointInTimeVersionManagerCore({
			listFileVersions: async () => [
				{ versionId: "tip", lastModifiedDateTime: "2026-09-17T00:00:00Z" },
				{ versionId: "newer", lastModifiedDateTime: "2026-09-16T00:00:00Z" },
				{ versionId: "inverted", lastModifiedDateTime: "2026-09-15T00:00:00Z" },
				{ versionId: "older", lastModifiedDateTime: "2026-09-14T00:00:00Z" },
			],
			resolveSequenceNumber: async (versionId) => sequenceNumbers.get(versionId)!,
			validateLiveEpoch: async () => {},
		});

		assert.deepEqual(await manager.findBaseForSeq(95), {
			kind: "found",
			base: {
				versionId: "inverted",
				lastModifiedDateTime: "2026-09-15T00:00:00Z",
				sequenceNumber: 90,
			},
		});
	});

	it("excludes the mutable tip from base selection", async () => {
		let resolutions = 0;
		const manager = createOdspPointInTimeVersionManagerCore({
			listFileVersions: async () => [
				{ versionId: "tip", lastModifiedDateTime: "2026-09-17T00:00:00Z" },
			],
			resolveSequenceNumber: async () => {
				resolutions++;
				return 100;
			},
			validateLiveEpoch: async () => {},
		});

		assert.deepEqual(await manager.findBaseForSeq(100), { kind: "noBaseVersion" });
		assert.equal(resolutions, 0);
	});

	it("reports the oldest resolved sequence when no base precedes the target", async () => {
		const manager = createOdspPointInTimeVersionManagerCore({
			listFileVersions: async () => [
				{ versionId: "tip", lastModifiedDateTime: "2026-09-17T00:00:00Z" },
				{ versionId: "sealed", lastModifiedDateTime: "2026-09-16T00:00:00Z" },
			],
			resolveSequenceNumber: async () => 50,
			validateLiveEpoch: async () => {},
		});

		assert.deepEqual(await manager.findBaseForSeq(40), {
			kind: "noBaseVersion",
			oldestResolvedSeq: 50,
		});
	});

	it("keeps a valid base when older retained history crosses an epoch boundary", async () => {
		const lineageError = Object.assign(new Error("older lineage"), {
			errorType: OdspErrorTypes.fileOverwrittenInStorage,
		});
		const manager = createOdspPointInTimeVersionManagerCore({
			listFileVersions: async () => [
				{ versionId: "tip", lastModifiedDateTime: "2026-09-17T00:00:00Z" },
				{ versionId: "current", lastModifiedDateTime: "2026-09-16T00:00:00Z" },
				{ versionId: "old-lineage", lastModifiedDateTime: "2026-09-15T00:00:00Z" },
			],
			resolveSequenceNumber: async (versionId) => {
				if (versionId === "old-lineage") {
					throw lineageError;
				}
				return 80;
			},
			validateLiveEpoch: async () => {},
		});

		assert.deepEqual(await manager.findBaseForSeq(90), {
			kind: "found",
			base: {
				versionId: "current",
				lastModifiedDateTime: "2026-09-16T00:00:00Z",
				sequenceNumber: 80,
			},
		});
	});

	it("validates the live epoch after selecting a historical base", async () => {
		const reads: string[] = [];
		const manager = createOdspPointInTimeVersionManagerCore({
			listFileVersions: async () => [
				{ versionId: "tip", lastModifiedDateTime: "2026-09-17T00:00:00Z" },
				{ versionId: "sealed", lastModifiedDateTime: "2026-09-16T00:00:00Z" },
			],
			resolveSequenceNumber: async () => {
				reads.push("sealed");
				return 50;
			},
			validateLiveEpoch: async () => {
				reads.push("live");
			},
		});

		const result = await manager.findBaseForSeq(50);
		assert.equal(result.kind, "found");
		assert.deepEqual(reads, ["sealed", "live"]);
	});

	it("rejects a selected base when final live lineage validation fails", async () => {
		const lineageError = Object.assign(new Error("restore raced selection"), {
			errorType: OdspErrorTypes.fileOverwrittenInStorage,
		});
		const manager = createOdspPointInTimeVersionManagerCore({
			listFileVersions: async () => [
				{ versionId: "tip", lastModifiedDateTime: "2026-09-17T00:00:00Z" },
				{ versionId: "sealed", lastModifiedDateTime: "2026-09-16T00:00:00Z" },
			],
			resolveSequenceNumber: async () => 50,
			validateLiveEpoch: async () => {
				throw lineageError;
			},
		});

		await assert.rejects(
			manager.findBaseForSeq(50),
			(error: Error) =>
				(error as { readonly errorType?: unknown }).errorType ===
				OdspErrorTypes.fileOverwrittenInStorage,
		);
	});
});
