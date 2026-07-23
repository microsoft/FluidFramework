/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Point-in-time failure scenario (real service): epoch (lineage) mismatch.
 *
 * ODSP's "restore previous version" rewrites the file's head, which bumps the file's storage epoch
 * (`x-fluid-epoch`) and resumes the op stream from the restored point with a *new* epoch. A base
 * version chosen from before the restore is therefore on a different lineage than the live document,
 * so the live document's ops cannot be replayed onto it. A point-in-time load must fail with the
 * driver's non-retryable epoch-mismatch error rather than materialize wrong state. This mirrors the
 * unit coverage in odspVersionManagerLineage.spec.ts against the real service.
 */

import { strict as assert } from "assert";

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import type { IRuntimeFactory } from "@fluidframework/container-definitions/internal";
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
	loadPointInTimeContainer,
	type IPointInTimeTestObject,
} from "./pointInTimeTestUtils.js";

describeCompat(
	"Point-in-time epoch (lineage) mismatch (real service)",
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
					const documentId = createDocumentId();
				const container = await createAttachedPointInTimeContainer(
					provider,
					runtimeFactory,
					tracker,
					documentId,
				);
				const dataObject = (await container.getEntryPoint()) as IPointInTimeTestObject;
				const versionApi: OdspVersionTestApiProps = createOdspVersionTestApiProps(
					provider,
					container,
				);
	
				const incrementAndSync = async (count: number): Promise<void> => {
					for (let i = 0; i < count; i++) {
						dataObject.increment();
					}
					await tracker.ensureSynchronized(container);
				};
	
				// Arrange two snapped versions so there is an older, non-tip version to restore to. The
				// target seq is captured before the restore so the load is bound to the pre-restore lineage.
				await incrementAndSync(2);
				const targetSequenceNumber = container.deltaManager.lastSequenceNumber;
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
	
				// Restoring rewrites the file's head, which bumps the ODSP storage epoch. A point-in-time
				// load bound to the pre-restore epoch is therefore expected to fail with an epoch mismatch.
				const restored = await restoreFileVersion(versionApi, older.id);
				assert.strictEqual(restored, true, "restore should succeed (HTTP 204)");
	
				await assert.rejects(
					loadPointInTimeContainer(provider, runtimeFactory, documentId, targetSequenceNumber),
					(error: Error) => /epoch/i.test(error.message),
					"expected an epoch-mismatch error after restoring a previous version",
				);
			},
		);
	},
);
