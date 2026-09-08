/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
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

		// Same epoch-mismatch mechanism as above, but exercised through a deeper, more realistic
		// history: five summarized versions are snapped so each captures a distinct, advancing
		// snapshot, and the restore targets a *middle* version (the 3rd of the five) rather than the
		// oldest. Restoring it rewrites the file's head - creating a new head version whose content is
		// the 3rd version's but on a *new* ODSP storage epoch - while the five originally-snapped
		// versions stay behind on the pre-restore epoch. A point-in-time load that targets the
		// pre-restore tip must therefore pick a base from those stale-epoch versions and replay the
		// live (new-epoch) op stream forward; the version manager's lineage check catches the epoch
		// divergence and fails the load non-retryably with `fileOverwrittenInStorage` instead of
		// materializing renumbered state. This guards the case where the restored version is neither
		// the tip nor the oldest, so the stale base sits in the middle of the retained history.
		itExpects(
			"fails a point-in-time load after restoring a middle version bumps the epoch",
			[
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					errorType: "fileOverwrittenInStorage",
				},
			],
			async function (this: Mocha.Context) {
				// Five summaries + syncs against the real service, so raise the timeout accordingly.
				this.timeout(120_000);

				const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: true });
				const { container, versionApi, documentId, incrementAndSync, snapVersion } = ctx;

				// Build a five-version history on a single lineage. Summaries (withSummarizer) make each
				// snapped version capture advanced, distinct persisted state so the versions differ by
				// content and sequence number - restoring the 3rd is then meaningfully different from
				// restoring the oldest or newest.
				await incrementAndSync(2);
				await snapVersion("v1");
				await incrementAndSync(2);
				await snapVersion("v2");
				await incrementAndSync(2);
				await snapVersion("v3");

				// Capture the exact id of the just-snapped 3rd version. Reading the version list right
				// after the snap makes this robust to any extra service-created versions (creation
				// snapshot, per-summary versions) that would otherwise perturb positional indexing:
				// index 0 is always the version the preceding metadata PATCH just snapped.
				const afterThirdSnap = await listFileVersions(versionApi);
				assert(afterThirdSnap.length >= 3, "expected at least three snapped versions by now");
				const thirdVersion = afterThirdSnap[0];

				await incrementAndSync(2);
				await snapVersion("v4");
				await incrementAndSync(2);
				await snapVersion("v5");

				// Target the pre-restore tip: reaching it requires replaying the pre-restore op stream on
				// top of a pre-restore base, which is exactly what the restore is about to invalidate.
				const targetSequenceNumber = container.deltaManager.lastSequenceNumber;

				const versions = await listFileVersions(versionApi);
				assert(versions.length >= 5, "expected at least five snapped versions to exist");

				// Restore the middle (3rd) version. This creates a new head version with the 3rd
				// version's content but a fresh ODSP epoch, leaving v1..v5 stranded on the old epoch.
				const restored = await restoreFileVersion(versionApi, thirdVersion.id);
				assert.strictEqual(restored, true, "restore should succeed (HTTP 204)");

				// The load must pick a base from the stale-epoch versions (every version except the new
				// head) and, on finding its epoch differs from the live document's, fail with the
				// driver's non-retryable epoch-mismatch error rather than replay across lineages.
				await assert.rejects(
					loadPointInTimeContainer(
						suite.provider(),
						suite.runtimeFactory(),
						documentId,
						targetSequenceNumber,
					),
					(error: Error) => /epoch/i.test(error.message),
					"expected an epoch-mismatch error after restoring a middle version",
				);
			},
		);

		// The failed point-in-time load closes its container non-retryably because the ops needed to
		// reach the target are unavailable. The beyond-tip fetch deterministically logs three
		// error-category telemetry events, in this order, which must all be declared via itExpects;
		// otherwise the suite's unexpected-error check would flag them and fail the test even though
		// the assertion in the body passed:
		//   1. OdspDriver:GetDeltas_Error   - the storage layer (parallelRequests) gives up on the
		//      empty beyond-tip range after ~30s with a non-retryable `genericNetworkError`
		//      ("Failed to retrieve ops from storage (Too Many Retries)").
		//   2. DeltaManager:GetDeltas_Exception - the delta manager's catch-up fetch surfaces that
		//      failure (converted by the bounded delta-storage wrapper to `cannotCatchUp`).
		//   3. Container:ContainerClose - the delta manager closes the container with that error.
		//
		// All three are matched by event name only: the bounded delta-storage wrapper is designed to
		// convert the underlying `genericNetworkError` into the driver's canonical `cannotCatchUp`,
		// but against the real service the container can close with either errorType, so the body
		// asserts the specific op-availability failure rather than pinning an errorType here.
		// Because of that ~30s retry window plus the summaries in setup, this test raises its timeout.
		itExpects(
			"fails a point-in-time load when the ops needed to reach the target are unavailable",
			[
				{ eventName: "fluid:telemetry:OdspDriver:GetDeltas_Error" },
				{ eventName: "fluid:telemetry:DeltaManager:GetDeltas_Exception" },
				{ eventName: "fluid:telemetry:Container:ContainerClose" },
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
				// bridging replay cannot reach the target and the load must fail non-retryably.
				const beyondTip = container.deltaManager.lastSequenceNumber + 50;

				// Capture the actual error rather than relying on assert.rejects' opaque validator, so
				// that when the load rejects with an unexpected error the failure message reports the
				// real errorType and message instead of just "expected a cannotCatchUp error".
				let caught: (Error & { errorType?: string }) | undefined;
				try {
					await loadPointInTimeContainer(
						suite.provider(),
						suite.runtimeFactory(),
						documentId,
						beyondTip,
					);
				} catch (error) {
					caught = error as Error & { errorType?: string };
				}

				assert(
					caught !== undefined,
					"expected the point-in-time load to fail when the target is beyond the retained ops, but it resolved",
				);
				// Accept the driver's canonical `cannotCatchUp` (the bounded delta-storage wrapper's
				// intended conversion) as well as the underlying non-retryable ops-fetch failure it wraps
				// ("Failed to retrieve ops from storage (Too Many Retries)"), since against the real
				// service either can surface. The paused-load flow closes the container with the real
				// ops-unavailable error and then, in its `finally`, calls `disconnect()` on the now-closed
				// container - which throws `usageError` ("The Container is closed and cannot be
				// disconnected") that masks the original error. Accept that masking signature too, since it
				// only occurs after the container was closed by the genuine ops-unavailable failure. Any
				// other error is a genuine failure and is reported with its real errorType/message so the
				// cause is visible instead of an opaque assertion.
				const isOpUnavailableFailure =
					caught.errorType === "cannotCatchUp" ||
					/cannotcatchup|materialize/i.test(caught.message) ||
					(caught.errorType === "genericNetworkError" &&
						/failed to retrieve ops|too many retries/i.test(caught.message)) ||
					(caught.errorType === "usageError" &&
						/closed and cannot be disconnected/i.test(caught.message));
				assert(
					isOpUnavailableFailure,
					`expected an ops-unavailable failure (cannotCatchUp) when the target is beyond the ` +
						`retained ops, but got errorType=${caught.errorType} message=${caught.message}`,
				);
			},
		);
	},
);
