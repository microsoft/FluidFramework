/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Point-in-time LOAD FAILURE regressions (real service).
 *
 * A focused companion to `epochMismatch.spec.ts`, which covers the two canonical failure modes with
 * a first pass (epoch mismatch by restoring the oldest/middle version, and ops-unavailable by
 * targeting beyond the live tip). This file adds further regressions around the same two modes so
 * the failure surface stays covered as the point-in-time load path evolves:
 *
 * 1. Epoch (lineage) mismatch. ODSP treats a "disruptive update" to a file - most simply, restoring
 *    a previous version - as a new binary lineage: it rewrites the file's head and bumps the storage
 *    epoch (`x-fluid-epoch`), so every version snapped before the restore is stranded on the old
 *    epoch. A restore is therefore how these tests *simulate* the epoch change we cannot otherwise
 *    force. Two additional angles are exercised here:
 *      - restoring the NEWEST recoverable version (the oldest/middle cases live in epochMismatch), and
 *      - a restore followed by a load whose resolved base sits strictly BEFORE the target, so the
 *        failure is proven even when the loader would otherwise replay live (new-epoch) ops forward.
 *    Both must fail non-retryably with the driver's `fileOverwrittenInStorage` (epoch-mismatch) error.
 *
 * 2. Op availability. Replaying a base forward to the target needs every op in
 *    `(base.sequenceNumber, target]` to still be retrievable; targeting beyond the live tip makes
 *    those ops non-existent, so the load must fail non-retryably (`cannotCatchUp`).
 *
 * 3. Input validation. A malformed target (non-integer or negative) must be rejected up front with a
 *    `UsageError`, before any network work - a cheap, deterministic guard on the public entry point.
 */

import { strict as assert } from "assert";

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import type {
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";

import { listFileVersions, restoreFileVersion } from "./odspVersionTestApi.js";
import {
	createPointInTimeTestContext,
	loadPointInTimeContainer,
	setupPointInTimeSuite,
} from "./pointInTimeTestUtils.js";

describeCompat(
	"Point-in-time load failure (real service)",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const suite = setupPointInTimeSuite(getTestObjectProvider, apis);

		// A restore rewrites the file's head onto a fresh epoch; the point-in-time load then closes its
		// container with the driver's non-retryable fileOverwrittenInStorage (epoch-mismatch) error.
		// That ContainerClose is the expected outcome, so declare it via itExpects; otherwise
		// describeCompat's afterEach hook would flag it as an unexpected error and fail the suite.
		itExpects(
			"fails a point-in-time load after restoring the newest recoverable version bumps the epoch",
			[
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					errorType: "fileOverwrittenInStorage",
				},
			],
			async function (this: Mocha.Context) {
				// Multiple summaries + syncs against the real service, so raise the timeout accordingly.
				this.timeout(120_000);

				const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: true });
				const { container, versionApi, documentId, incrementAndSync, snapVersion } = ctx;

				// Build a single-lineage history of a few summarized versions.
				await incrementAndSync(2);
				await snapVersion("v1");
				await incrementAndSync(2);
				await snapVersion("v2");
				await incrementAndSync(2);
				await snapVersion("v3");

				// The newest *recoverable* version is index 1, not index 0. Index 0 is the live
				// document's own tip: the driver never treats it as a recoverable base (findBaseForSeq
				// skips it via `versions.slice(1)`), and the service will not perform a disruptive 204
				// restore of the head onto itself (that is a no-op, so restoreFileVersion returns false).
				// Index 1 is the newest version below the tip - a genuine previous version whose restore
				// rewrites the head and bumps the epoch.
				const versions = await listFileVersions(versionApi);
				const newest = versions[1];
				assert(newest !== undefined, "expected a recoverable (non-tip) version to exist");

				// Target the pre-restore tip, reachable only by replaying the pre-restore op stream.
				const targetSequenceNumber = container.deltaManager.lastSequenceNumber;

				// Restoring the newest recoverable version still counts as a disruptive update: it creates
				// a new head version (new epoch) whose content is that version's, stranding every snapped
				// version - including this newest one - on the old epoch.
				const restored = await restoreFileVersion(versionApi, newest.id);
				assert.strictEqual(restored, true, "restore should succeed (HTTP 204)");

				await assert.rejects(
					loadPointInTimeContainer(
						suite.provider(),
						suite.runtimeFactory(),
						documentId,
						targetSequenceNumber,
					),
					(error: Error) => /epoch/i.test(error.message),
					"expected an epoch-mismatch error after restoring the newest recoverable version",
				);
			},
		);

		itExpects(
			"fails a point-in-time load whose base precedes the target after a disruptive restore",
			[
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					errorType: "fileOverwrittenInStorage",
				},
			],
			async function (this: Mocha.Context) {
				this.timeout(120_000);

				const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: true });
				const { container, versionApi, documentId, incrementAndSync, snapVersion } = ctx;

				// Snap an early base version, then capture an EARLY target a couple of ops later. Because
				// the base is snapped strictly before this target, the loader would resolve that early
				// base and replay the live op stream forward to reach the target - which is exactly the
				// cross-lineage replay the restore below invalidates.
				await incrementAndSync(2);
				await snapVersion("base");
				await incrementAndSync(2);
				const earlyTargetSequenceNumber = container.deltaManager.lastSequenceNumber;

				// Grow more history on top so the early target sits well inside the retained history.
				await incrementAndSync(2);
				await snapVersion("mid");
				await incrementAndSync(2);
				await snapVersion("tip");

				// Restore the oldest version - a disruptive update that bumps the epoch and strands the
				// early base (and every other pre-restore version) on the old lineage.
				const versions = await listFileVersions(versionApi);
				assert(versions.length >= 2, "expected at least two versions to restore between");
				const oldest = versions.at(-1);
				assert(oldest !== undefined, "expected an oldest version to restore to");
				const restored = await restoreFileVersion(versionApi, oldest.id);
				assert.strictEqual(restored, true, "restore should succeed (HTTP 204)");

				// Even though the base precedes the target (so a replay would be attempted), the version
				// manager's lineage check catches the epoch divergence and fails the load non-retryably
				// rather than replaying the live new-epoch ops onto the stale base.
				await assert.rejects(
					loadPointInTimeContainer(
						suite.provider(),
						suite.runtimeFactory(),
						documentId,
						earlyTargetSequenceNumber,
					),
					(error: Error) => /epoch/i.test(error.message),
					"expected an epoch-mismatch error when the base precedes the target after a restore",
				);
			},
		);

		// The failed point-in-time load closes its container non-retryably because the ops needed to
		// reach the target are unavailable. The beyond-tip fetch deterministically logs three
		// error-category telemetry events, in this order, which must all be declared via itExpects;
		// otherwise the suite's unexpected-error check would flag them even though the body's assertion
		// passed. (This is the same ops-unavailable mode as epochMismatch.spec.ts, kept here so this
		// focused failure suite covers both modes on its own.)
		itExpects(
			"fails a point-in-time load when the target is beyond the retained ops",
			[
				{ eventName: "fluid:telemetry:OdspDriver:GetDeltas_Error" },
				{ eventName: "fluid:telemetry:DeltaManager:GetDeltas_Exception" },
				{ eventName: "fluid:telemetry:Container:ContainerClose" },
			],
			async function (this: Mocha.Context) {
				this.timeout(120_000);

				const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: true });
				const { container, documentId, incrementAndSync, snapVersion } = ctx;

				// Intact single-lineage history with a recoverable, non-tip base so the load gets past the
				// lineage check and reaches the op-availability check.
				await incrementAndSync(2);
				await snapVersion("base-snap");
				await incrementAndSync(2);
				await snapVersion("tip-snap");

				// Target a sequence number comfortably past the live tip. Those ops never existed, so the
				// bridging replay cannot reach the target and the load must fail non-retryably.
				const beyondTip = container.deltaManager.lastSequenceNumber + 50;

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
					"expected the point-in-time load to fail when the target is beyond the retained ops",
				);
				// Accept the driver's canonical `cannotCatchUp`, the underlying non-retryable ops-fetch
				// failure it wraps ("Failed to retrieve ops from storage (Too Many Retries)"), or the
				// `usageError` the paused-load flow surfaces when it disconnects the container it just
				// closed on the ops-unavailable error ("The Container is closed and cannot be
				// disconnected"): against the real service any of the three can surface, and the last only
				// occurs after the container was already closed by the genuine ops-unavailable failure.
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

		// A caller can cancel an in-flight point-in-time load via its AbortSignal. The load waits while
		// the delta manager replays ops toward the target; firing the signal during that replay must
		// reject the load (and close the container) with a cancellation error rather than hanging or
		// materializing a container.
		//
		// The cancelled load closes its container with the loader's generic cancellation error, so that
		// ContainerClose is the expected outcome and is declared via itExpects (otherwise the suite's
		// afterEach would flag it as unexpected).
		//
		// The beyond-tip target used below to keep the load pending also makes the delta-storage layer
		// emit the same ops-unavailable telemetry as the beyond-tip test - OdspDriver:GetDeltas_Error
		// ("Too Many Retries") and DeltaManager:GetDeltas_Exception - as a byproduct while the abort
		// tears the load down. Because the loader's abort signal does not propagate into the op-fetch
		// layer, that fetch races the abort-driven container close, so those two error events may or may
		// not fire before the close - they can't be declared as (required, ordered) itExpects events.
		// They are not the behavior under test (the cancellation is), so the abortingLogger below
		// downgrades them from error to generic before the tracker sees them, keeping the suite's
		// unexpected-error check focused on genuinely unexpected errors.
		itExpects(
			"cancels an in-flight point-in-time load when its abort signal fires",
			[
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					errorType: "genericError",
				},
			],
			async function (this: Mocha.Context) {
				this.timeout(120_000);

				const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: true });
				const { container, documentId, incrementAndSync, snapVersion } = ctx;

				// Intact single-lineage history with a recoverable, non-tip base so the load gets past the
				// lineage check and reaches the op-replay stage where the abort signal takes effect.
				await incrementAndSync(2);
				await snapVersion("base-snap");
				await incrementAndSync(2);
				await snapVersion("tip-snap");

				// Target beyond the live tip so the load can never satisfy itself and reach a natural
				// completion: it stays in the retry/replay loop (each op-availability check is transient
				// and retryable) until we cancel it. This makes the cancellation - not a race with a
				// successful load - the deterministic outcome.
				const beyondTip = container.deltaManager.lastSequenceNumber + 50;

				// Fire the abort the moment the op replay begins. The point-in-time service only fetches
				// deltas after the loader has installed its abort listener and started catching up, so
				// aborting on the first GetDeltas telemetry cancels a genuinely in-flight load - never
				// before the listener exists (an abort event delivered before registration is missed), and
				// long before the beyond-tip retries would otherwise exhaust into a terminal failure.
				const abortController = new AbortController();
				let aborted = false;
				const abortingLogger: ITelemetryBaseLogger = {
					send: (event: ITelemetryBaseEvent): void => {
						if (!aborted && event.eventName.includes("GetDeltas")) {
							aborted = true;
							abortController.abort();
						}
						// The beyond-tip target keeps the load pending by making the delta-storage layer fail
						// to fetch the (non-existent) ops, which emits OdspDriver:GetDeltas_Error ("Too Many
						// Retries") and DeltaManager:GetDeltas_Exception. These are byproducts of how the load
						// is held open, not the cancellation under test, and race the abort-driven container
						// close. Downgrade them from error to generic before the tracker sees them - but only
						// when the message is the expected ops-unavailable failure (the same signatures the
						// beyond-tip test asserts). That firing is exactly the pending-load mechanism working;
						// any OTHER GetDeltas error stays error-category so a genuinely unexpected failure is
						// not masked and still fails the suite's unexpected-error check.
						if (
							event.category === "error" &&
							(event.eventName.endsWith("GetDeltas_Error") ||
								event.eventName.endsWith("GetDeltas_Exception"))
						) {
							const message = typeof event.error === "string" ? event.error : "";
							const isExpectedOpsUnavailable =
								/failed to retrieve ops|too many retries/i.test(message) ||
								/cannotcatchup|materialize/i.test(message);
							if (isExpectedOpsUnavailable) {
								event.category = "generic";
							}
						}
						suite.provider().logger.send(event);
					},
				};

				await assert.rejects(
					loadPointInTimeContainer(
						suite.provider(),
						suite.runtimeFactory(),
						documentId,
						beyondTip,
						abortController.signal,
						abortingLogger,
					),
					(error: Error & { errorType?: string }) => {
						// The abort rejects the wait with the loader's generic cancellation error and closes
						// the container (logged as ContainerClose/genericError, declared above). The paused-load
						// flow then disconnects the container it just closed, and disconnecting a closed
						// container throws a usageError ("The Container is closed and cannot be disconnected")
						// that supersedes the cancellation error - so either can surface. Both prove the abort
						// tore the load down rather than letting it hang or produce a container.
						const isCancellation =
							/cancel/i.test(error.message) ||
							/closed and cannot be disconnected/i.test(error.message);
						assert(
							isCancellation,
							`expected a cancellation-driven failure, got errorType=${error.errorType} message=${error.message}`,
						);
						return true;
					},
					"a point-in-time load must reject when its abort signal fires mid-replay",
				);
				assert(
					aborted,
					"the load should have started replaying ops (emitting GetDeltas) before ending",
				);
			},
		);

		// Malformed targets are rejected by loadContainerToSequenceNumber before any network work, so
		// these are fast and need no itExpects (no container is ever loaded or closed).
		it("rejects a malformed target sequence number with a UsageError", async () => {
			const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: false });
			const { documentId } = ctx;

			const loadTo = async (target: number): Promise<void> => {
				await loadPointInTimeContainer(
					suite.provider(),
					suite.runtimeFactory(),
					documentId,
					target,
				);
			};

			await assert.rejects(
				loadTo(-1),
				(error: Error) => /non-negative integer/i.test(error.message),
				"a negative target should be rejected up front",
			);
			await assert.rejects(
				loadTo(1.5),
				(error: Error) => /non-negative integer/i.test(error.message),
				"a non-integer target should be rejected up front",
			);
		});
	},
);
