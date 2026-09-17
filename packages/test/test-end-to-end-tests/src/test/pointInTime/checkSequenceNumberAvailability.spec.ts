/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Real-service coverage for the point-in-time availability API. These tests exercise the public
 * loader entry point against ODSP version history and delta storage without loading a historical
 * container.
 */

import { strict as assert } from "assert";

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";

import { restoreFileVersion } from "./odspVersionTestApi.js";
import {
	checkPointInTimeAvailability,
	createPointInTimeTestContext,
	loadPointInTimeContainer,
	setupPointInTimeSuite,
	type IPointInTimeTestObject,
} from "./pointInTimeTestUtils.js";

describeCompat(
	"Point-in-time sequence-number availability (real service)",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const suite = setupPointInTimeSuite(getTestObjectProvider, apis);

		it("checks multiple retained targets in one request and preserves input order", async function (this: Mocha.Context) {
			this.timeout(120_000);

			const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: true });
			const { container, dataObject, documentId, incrementAndSync, snapVersion } = ctx;

			await incrementAndSync(2);
			await snapVersion("base");

			await incrementAndSync(2);
			const earlyTarget = container.deltaManager.lastSequenceNumber;
			const earlyValue = dataObject.value;
			await incrementAndSync(3);
			const lateTarget = container.deltaManager.lastSequenceNumber;
			const lateValue = dataObject.value;

			// Make the targets historical relative to a newer recoverable version.
			await snapVersion("later");

			const result = await checkPointInTimeAvailability(suite.provider(), documentId, [
				lateTarget,
				earlyTarget,
				lateTarget,
			]);

			assert.deepEqual(result, [
				{ sequenceNumber: lateTarget, status: "available" },
				{ sequenceNumber: earlyTarget, status: "available" },
				{ sequenceNumber: lateTarget, status: "available" },
			]);

			for (const [target, expectedValue] of [
				[earlyTarget, earlyValue],
				[lateTarget, lateValue],
			] as const) {
				const loaded = await loadPointInTimeContainer(
					suite.provider(),
					suite.runtimeFactory(),
					documentId,
					target,
				);
				const loadedObject = (await loaded.getEntryPoint()) as IPointInTimeTestObject;
				assert.equal(loaded.deltaManager.lastSequenceNumber, target);
				assert.equal(loadedObject.value, expectedValue);
				loaded.close();
			}
		});

		it("reports a target beyond the observed storage head as unknown", async function (this: Mocha.Context) {
			this.timeout(120_000);

			const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: true });
			const { container, documentId, incrementAndSync, snapVersion } = ctx;

			await incrementAndSync(2);
			await snapVersion("base");
			await incrementAndSync(2);
			await snapVersion("tip");

			const beyondHead = container.deltaManager.lastSequenceNumber + 50;
			const result = await checkPointInTimeAvailability(suite.provider(), documentId, [
				beyondHead,
			]);

			assert.deepEqual(result, [
				{ sequenceNumber: beyondHead, status: "unknown", reason: "transientFailure" },
			]);
		});

		itExpects(
			"reports restore-ambiguous targets as unknown after a version restore",
			[
				{
					eventName: "fluid:telemetry:OdspDriver:fileOverwrittenInStorage",
					errorType: "fileOverwrittenInStorage",
				},
			],
			async function (this: Mocha.Context) {
				this.timeout(120_000);

				const ctx = await createPointInTimeTestContext(suite, apis, {
					withSummarizer: true,
				});
				const { container, versionApi, documentId, incrementAndSync, snapVersion } = ctx;

				await incrementAndSync(2);
				const target = container.deltaManager.lastSequenceNumber;
				const older = await snapVersion("first");
				await incrementAndSync(2);
				await snapVersion("second");

				assert.strictEqual(
					await restoreFileVersion(versionApi, older.id),
					true,
					"restore should succeed",
				);

				const result = await checkPointInTimeAvailability(suite.provider(), documentId, [
					target,
				]);

				assert.deepEqual(result, [
					{ sequenceNumber: target, status: "unknown", reason: "transientFailure" },
				]);
			},
		);

		it("returns unknown for a pre-canceled request", async () => {
			const ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: false });
			const controller = new AbortController();
			controller.abort();

			const result = await checkPointInTimeAvailability(
				suite.provider(),
				ctx.documentId,
				[ctx.container.deltaManager.lastSequenceNumber],
				controller.signal,
			);

			assert.deepEqual(result, [
				{
					sequenceNumber: ctx.container.deltaManager.lastSequenceNumber,
					status: "unknown",
					reason: "transientFailure",
				},
			]);
		});
	},
);
