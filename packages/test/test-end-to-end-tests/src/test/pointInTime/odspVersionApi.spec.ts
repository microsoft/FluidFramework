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
import type {
	IContainer,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import {
	ITestObjectProvider,
	LoaderContainerTracker,
	createDocumentId,
} from "@fluidframework/test-utils/internal";

import {
	listFileVersions,
	restoreFileVersion,
	triggerVersionViaMetadata,
	type OdspVersionTestApiProps,
} from "./odspVersionTestApi.js";
import { createOdspVersionTestApiProps } from "./odspVersionTestFixture.js";
import {
	createAttachedPointInTimeContainer,
	createPointInTimeRuntimeFactory,
	type IPointInTimeTestObject,
} from "./pointInTimeTestUtils.js";

describeCompat(
	"ODSP version REST api (real service)",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		let provider: ITestObjectProvider;
		let runtimeFactory: IRuntimeFactory;
		const tracker = new LoaderContainerTracker();

		before(function () {
			provider = getTestObjectProvider();
			if (provider.driver.type !== "odsp") {
				this.skip();
			}
			runtimeFactory = createPointInTimeRuntimeFactory(apis);
		});

		afterEach(() => tracker.reset());

		let documentId: string;
		let container: IContainer;
		let dataObject: IPointInTimeTestObject;
		let versionApi: OdspVersionTestApiProps;

		beforeEach(async () => {
			documentId = createDocumentId();
			container = await createAttachedPointInTimeContainer(
				provider,
				runtimeFactory,
				tracker,
				documentId,
			);
			dataObject = (await container.getEntryPoint()) as IPointInTimeTestObject;
			versionApi = createOdspVersionTestApiProps(provider, container);
		});

		/** Generate `count` ops and wait for them to be sequenced. */
		async function incrementAndSync(count: number): Promise<void> {
			for (let i = 0; i < count; i++) {
				dataObject.increment();
			}
			await tracker.ensureSynchronized(container);
		}

		it("snaps a new version via metadata and lists it in the version history", async () => {
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
