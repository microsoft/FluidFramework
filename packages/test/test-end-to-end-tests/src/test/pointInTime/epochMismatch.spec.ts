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
 *    `(base.sequenceNumber, target]` to still be retained. When the bridging ops are missing, the
 *    load must fail with the driver's non-retryable `cannotCatchUp` error. The real cause of missing
 *    ops is ODSP op retention (best-effort, time-based, with no on-demand trim), so we cannot force a
 *    genuinely trimmed low-end gap without waiting out retention. What we CAN drive deterministically
 *    is the same failure surface from the other end: request a target beyond the document's head, so
 *    the ops required to reach it never existed and the bounded delta-storage wrapper ends short of
 *    the target. The cause differs (never existed vs. trimmed) but the validated code path and error
 *    contract are identical.
 *
 * These mirror the driver-level unit coverage (lineage validation in odspVersionManager.spec.ts and
 * the bounded delta-storage wrapper in odspPointInTimeDocumentService.spec.ts) against the real
 * service.
 */

import { strict as assert } from "assert";

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";

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
		// cannotCatchUp error. That ContainerClose is the expected outcome, so declare it via itExpects;
		// otherwise describeCompat's afterEach hook would flag it as an unexpected error and fail the
		// suite.
		itExpects(
			"fails a point-in-time load when the ops needed to reach the target are unavailable",
			[
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					errorType: OdspErrorTypes.cannotCatchUp,
				},
			],
			async () => {
				const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: true });
				const { container, documentId, incrementAndSync, snapVersion } = ctx;

				// Arrange an intact, single-lineage history with a recoverable (non-tip) base on the live
				// document's epoch, so the load gets past the lineage check and reaches the op-availability
				// check (there is no restore/reupload, so the epoch never changes).
				await incrementAndSync(2);
				await snapVersion("base-snap");
				await incrementAndSync(2);
				await snapVersion("tip-snap");

				// Request a target far beyond the document's head. A base at/before the target resolves (the
				// newest recoverable version, same epoch), but the ops in (base, target] cannot all exist,
				// so the bounded delta-storage wrapper ends short of the target and rejects with
				// cannotCatchUp - the same non-retryable failure a retention-trimmed gap produces.
				const headSequenceNumber = container.deltaManager.lastSequenceNumber;
				const targetBeyondHead = headSequenceNumber + 1000;

				await assert.rejects(
					loadPointInTimeContainer(
						suite.provider(),
						suite.runtimeFactory(),
						documentId,
						targetBeyondHead,
					),
					(error: Error) => {
						assert.match(
							error.message,
							/Cannot materialize sequence number|ops needed to replay the base snapshot are unavailable/,
							"expected an op-availability error naming the unavailable ops",
						);
						assert.equal(
							(error as Partial<{ errorType: string }>).errorType,
							OdspErrorTypes.cannotCatchUp,
							"unavailable bridging ops must surface as a cannotCatchUp driver error",
						);
						assert.equal(
							(error as Partial<{ canRetry: boolean }>).canRetry,
							false,
							"missing ops never come back on retry",
						);
						return true;
					},
				);
			},
		);
	},
);
