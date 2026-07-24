/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Point-in-time failure scenario (real service): op availability.
 *
 * Replaying a base snapshot forward to the target needs every op in `(base.sequenceNumber, target]`
 * to still be retained and contiguous. When the bridging ops are missing, the point-in-time load
 * must fail with the driver's non-retryable `cannotCatchUp` error rather than materialize partial or
 * wrong state.
 *
 * The real cause of missing ops is ODSP op retention: trimming is best-effort and time-based
 * (e.g. ~7 days), and there is no ODSP operation to force it on demand (unlike a version restore,
 * which the epoch-mismatch suite uses to bump the epoch deterministically). So we cannot reproduce a
 * genuinely trimmed low-end gap e2e without waiting out retention. What we CAN do deterministically
 * is drive the SAME `validateOpsAvailable` -> `cannotCatchUp` failure surface from the other end:
 * request a target sequence number beyond the document's head, so the ops required to reach it do not
 * exist and the op-availability walk runs off the end of the feed. The cause differs (ops never
 * existed vs. were trimmed) but the validated code path and error contract are identical. The gap /
 * mid-range / empty-feed shapes of trimming itself are covered by the unit suite
 * odspVersionManagerOpAvailability.spec.ts against a fake feed.
 */

import { strict as assert } from "assert";

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";

import {
	createPointInTimeTestContext,
	loadPointInTimeContainer,
	setupPointInTimeSuite,
} from "./pointInTimeTestUtils.js";

describeCompat(
	"Point-in-time op availability (real service)",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const suite = setupPointInTimeSuite(getTestObjectProvider, apis);

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
				const { container, incrementAndSync, snapVersion } = ctx;

				// Arrange an intact, single-lineage history with a recoverable (non-tip) base on the live
				// document's epoch, so the load gets past the lineage check and reaches the op-availability
				// check (there is no restore/reupload, so the epoch never changes).
				await incrementAndSync(2);
				await snapVersion("base-snap");
				await incrementAndSync(2);
				await snapVersion("tip-snap");

				// Request a target far beyond the document's head. A base at/before the target resolves (the
				// newest recoverable version), but the ops in (base, target] cannot all exist, so the
				// op-availability walk runs off the end of the feed and rejects with cannotCatchUp - the
				// same non-retryable failure a retention-trimmed gap produces.
				const headSequenceNumber = container.deltaManager.lastSequenceNumber;
				const targetBeyondHead = headSequenceNumber + 1000;

				await assert.rejects(
					loadPointInTimeContainer(
						suite.provider(),
						suite.runtimeFactory(),
						ctx.documentId,
						targetBeyondHead,
					),
					(error: Error) => {
						assert.match(
							error.message,
							/no ops at or after|no longer available|not contiguous/,
							"expected an op-availability error naming the missing ops",
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
