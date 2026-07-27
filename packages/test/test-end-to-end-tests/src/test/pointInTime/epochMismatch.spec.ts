/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Point-in-time failure scenarios (real service).
 *
 * A point-in-time load materializes a document at a target sequence number by replaying the live op
 * stream on top of a recoverable base version. That replay is only valid when (a) the base is on the
 * live document's lineage and (b) the bridging ops are still retained. This suite exercises both
 * failure modes end to end against the real ODSP service:
 *
 * 1. Epoch (lineage) mismatch. ODSP's "restore previous version" rewrites the file's head, which
 *    bumps the file's storage epoch (`x-fluid-epoch`) and resumes the op stream from the restored
 *    point with a *new* epoch. A base chosen from before the restore is therefore on a different
 *    lineage than the live document, so the load must fail with the driver's non-retryable
 *    `fileOverwrittenInStorage` (epoch-mismatch) error rather than materialize wrong state.
 *
 * 2. Op availability. Replaying a base forward to the target needs every op in
 *    `(base.sequenceNumber, target]` to still be retrievable. When a bridging op cannot be
 *    retrieved, the load must fail with the driver's non-retryable `cannotCatchUp` error. This is
 *    exercised by targeting a sequence number beyond the live document's tip: those ops never
 *    existed, the ops-fetch layer exhausts its retries, and the bounded delta-storage wrapper
 *    surfaces `cannotCatchUp`. (Because the fetch layer retries for ~30s before giving up, this test
 *    raises its own timeout.)
 *
 * These mirror the driver-level unit coverage (lineage validation in odspVersionManager.spec.ts and
 * the bounded delta-storage wrapper in odspPointInTimeDocumentService.spec.ts) against the real
 * service.
 */

import { strict as assert } from "assert";

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";

import { listFileVersions, restoreFileVersion } from "./odspVersionTestApi.js";
import {
	createPointInTimeTestContext,
	loadPointInTimeContainer,
	setupPointInTimeSuite,
} from "./pointInTimeTestUtils.js";

describeCompat(
	"Point-in-time failure scenarios (real service)",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const suite = setupPointInTimeSuite(getTestObjectProvider, apis);

		// The failed point-in-time load closes its container with the driver's non-retryable
		// fileOverwrittenInStorage (epoch-mismatch) error. That ContainerClose is the expected
		// outcome, so declare it via itExpects; otherwise describeCompat's afterEach hook would
		// flag it as an unexpected error in the logs and fail the suite.
		itExpects(
			"fails a point-in-time load after restoring a previous version bumps the epoch",
			[
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					errorType: "fileOverwrittenInStorage",
				},
			],
			async () => {
				const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: false });
				const { container, versionApi, documentId, incrementAndSync, snapVersion } = ctx;

				// Arrange two snapped versions so there is an older, non-tip version to restore to. The
				// target seq is captured before the restore so the load is bound to the pre-restore lineage.
				await incrementAndSync(2);
				const targetSequenceNumber = container.deltaManager.lastSequenceNumber;
				await snapVersion("snap-a");
				await incrementAndSync(2);
				await snapVersion("snap-b");

				const versions = await listFileVersions(versionApi);
				assert(versions.length >= 2, "expected at least two versions to restore between");
				const older = versions[versions.length - 1];

				// Restoring rewrites the file's head, which bumps the ODSP storage epoch. A point-in-time
				// load bound to the pre-restore epoch is therefore expected to fail with an epoch mismatch.
				const restored = await restoreFileVersion(versionApi, older.id);
				assert.strictEqual(restored, true, "restore should succeed (HTTP 204)");

				await assert.rejects(
					loadPointInTimeContainer(
						suite.provider(),
						suite.runtimeFactory(),
						documentId,
						targetSequenceNumber,
					),
					(error: Error) => /epoch/i.test(error.message),
					"expected an epoch-mismatch error after restoring a previous version",
				);
			},
		);

		// The failed point-in-time load closes its container with the driver's non-retryable
		// cannotCatchUp error. That ContainerClose is the expected outcome, so declare it via
		// itExpects; otherwise describeCompat's afterEach hook would flag it as an unexpected error.
		//
		// The target sequence number is set beyond the live document's tip, so the ops needed to
		// bridge from the recoverable base to the target never existed. The ops-fetch layer retries
		// the (empty) beyond-tip range for ~30s before giving up, and the bounded delta-storage
		// wrapper converts that non-retryable fetch failure into the driver's `cannotCatchUp` error.
		// Because of that ~30s retry window plus the summaries in setup, this test raises its timeout.
		itExpects(
			"fails a point-in-time load when the ops needed to reach the target are unavailable",
			[
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					errorType: "cannotCatchUp",
				},
			],
			async function (this: Mocha.Context) {
				this.timeout(120_000);

				const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: true });
				const { container, documentId, incrementAndSync, snapVersion } = ctx;

				// Arrange an intact, single-lineage history with a recoverable (non-tip) base on the live
				// document's epoch, so the load gets past the lineage check and reaches the
				// op-availability check.
				await incrementAndSync(2);
				await snapVersion("base-snap");
				await incrementAndSync(2);
				await snapVersion("tip-snap");

				// Target a sequence number comfortably past the live tip. Those ops never existed, so the
				// bridging replay cannot reach the target and the load must fail with cannotCatchUp.
				const beyondTip = container.deltaManager.lastSequenceNumber + 50;

				await assert.rejects(
					loadPointInTimeContainer(
						suite.provider(),
						suite.runtimeFactory(),
						documentId,
						beyondTip,
					),
					(error: Error & { errorType?: string }) =>
						error.errorType === "cannotCatchUp" ||
						/cannotCatchUp|materialize/i.test(error.message),
					"expected a cannotCatchUp error when the target is beyond the retained ops",
				);
			},
		);
	},
);
