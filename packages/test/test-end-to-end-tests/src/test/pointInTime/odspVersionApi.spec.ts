/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Real-service verification of the three raw ODSP version REST helpers
 * ({@link ./odspVersionTestApi.js}): listing the file's version history, snapping a new version by
 * altering item metadata, and restoring a previous version. These run only against the ODSP driver.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";

import {
	listFileVersions,
	restoreFileVersion,
	triggerVersionViaMetadata,
} from "./odspVersionTestApi.js";
import {
	createPointInTimeTestContext,
	setupPointInTimeSuite,
	type PointInTimeTestContext,
} from "./pointInTimeTestUtils.js";

describeCompat(
	"ODSP version REST api (real service)",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const suite = setupPointInTimeSuite(getTestObjectProvider, apis);

		let ctx: PointInTimeTestContext;

		beforeEach(async () => {
			ctx = await createPointInTimeTestContext(suite, apis, { withSummarizer: false });
		});

		it("snaps a new version via metadata and lists it in the version history", async () => {
			const { versionApi, incrementAndSync } = ctx;
			await incrementAndSync(3);

			const before = await listFileVersions(versionApi);

			const snapped = await triggerVersionViaMetadata(versionApi, {
				description: `point-in-time-test ${Date.now()}`,
			});
			assert.strictEqual(snapped, true, "metadata PATCH should snap a new version");

			const after = await listFileVersions(versionApi);
			assert(
				after.length > before.length,
				`expected a new version after snapping (before=${before.length}, after=${after.length})`,
			);
			for (const version of after) {
				assert(
					typeof version.id === "string" && version.id.length > 0,
					"version.id must be set",
				);
				assert(
					typeof version.lastModifiedDateTime === "string",
					"version.lastModifiedDateTime must be set",
				);
			}
		});

		it("restores a previous version (HTTP 204)", async () => {
			const { versionApi, incrementAndSync } = ctx;
			// Arrange two snapped versions so there is an older version to restore to that is not the tip.
			await incrementAndSync(2);
			assert.strictEqual(
				await triggerVersionViaMetadata(versionApi, { description: `snap-a ${Date.now()}` }),
				true,
			);
			await incrementAndSync(2);
			assert.strictEqual(
				await triggerVersionViaMetadata(versionApi, { description: `snap-b ${Date.now()}` }),
				true,
			);

			const versions = await listFileVersions(versionApi);
			assert(versions.length >= 2, "expected at least two versions to restore between");
			const older = versions[versions.length - 1];

			const restored = await restoreFileVersion(versionApi, older.id);
			assert.strictEqual(restored, true, "restore should succeed (HTTP 204)");
		});
	},
);
