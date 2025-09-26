/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import {
	asLegacyAlpha,
	createDetachedContainer,
	loadFrozenContainerFromPendingState,
} from "@fluidframework/container-loader/internal";
import type { FluidObject } from "@fluidframework/core-interfaces/internal";
import type { ISharedMap } from "@fluidframework/map/internal";
import { isFluidHandle, toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { timeoutPromise, type TestFluidObject } from "@fluidframework/test-utils/internal";
import { useFakeTimers, type SinonFakeTimers } from "sinon";

import { createLoader } from "../utils.js";

const toComparableArray = (dir: ISharedMap): [string, unknown][] =>
	[...dir.entries()].map(([key, value]) => [
		key,
		isFluidHandle(value) ? toFluidHandleInternal(value).absolutePath : value,
	]);

describe("loadFrozenContainerFromPendingState", () => {
	it("loadFrozenContainerFromPendingState", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		const { urlResolver, codeDetails, codeLoader, loaderProps } = createLoader({
			deltaConnectionServer,
		});
		const container = asLegacyAlpha(
			await createDetachedContainer({
				codeDetails,
				...loaderProps,
				configProvider: {
					getRawConfig: (name) => {
						switch (name) {
							case "Fluid.Container.enableOfflineLoad":
								return true;
							default:
								return undefined;
						}
					},
				},
			}),
		);
		const { ITestFluidObject }: FluidObject<TestFluidObject> =
			(await container.getEntryPoint()) ?? {};
		assert(
			ITestFluidObject !== undefined,
			"Expected entrypoint to be a valid TestFluidObject, but it was undefined",
		);

		for (let i = 0; i < 10; i++) {
			ITestFluidObject.root.set(`detached-${i}`, i);
		}

		await container.attach(urlResolver.createCreateNewRequest("test"));
		for (let i = 0; i < 10; i++) {
			ITestFluidObject.root.set(`attached-${i}`, i);
		}
		const url = await container.getAbsoluteUrl("");
		assert(
			url !== undefined,
			"Expected container to provide a valid absolute URL, but got undefined",
		);

		container.disconnect();
		for (let i = 0; i < 10; i++) {
			ITestFluidObject.root.set(`disconnected-${i}`, i);
		}

		const pendingLocalState = await container.getPendingLocalState();

		const frozenContainer = await loadFrozenContainerFromPendingState({
			codeLoader,
			urlResolver,
			request: {
				url,
			},
			pendingLocalState,
		});

		assert(
			frozenContainer.readOnlyInfo.readonly === true,
			"Expected frozen container to be in readonly mode, but it was not",
		);
		assert(
			frozenContainer.readOnlyInfo.storageOnly === true,
			"Expected frozen container to be storage-only, but it was not",
		);

		const frozenEntryPoint: FluidObject<TestFluidObject> =
			await frozenContainer.getEntryPoint();
		assert(
			frozenEntryPoint.ITestFluidObject !== undefined,
			"Expected frozen container entrypoint to be a valid TestFluidObject, but it was undefined",
		);

		const frozenEntries = toComparableArray(frozenEntryPoint.ITestFluidObject.root);
		assert.deepEqual(
			frozenEntries,
			toComparableArray(ITestFluidObject.root),
			"Expected frozen container's data to match the original container's state after pending local state was captured.",
		);

		container.connect();
		for (let i = 0; i < 10; i++) {
			ITestFluidObject.root.set(`afterGetPendingLocalState-${i}`, i);
		}

		if (container.isDirty) {
			await timeoutPromise((resolve) => container.once("saved", () => resolve()));
		}
		assert.notDeepEqual(
			frozenEntries,
			toComparableArray(ITestFluidObject.root),
			"Expected frozen container's data to differ from the original container after new changes were made post-pending state.",
		);
		assert.deepEqual(
			frozenEntries,
			toComparableArray(frozenEntryPoint.ITestFluidObject.root),
			"Expected frozen container's data to remain unchanged after new changes in the original container.",
		);
	});

	let clock: SinonFakeTimers;
	const snapshotRefreshTimeoutMs = 10;

	before(() => {
		clock = useFakeTimers();
	});

	it("uploading blob on frozen container", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		const { urlResolver, codeDetails, codeLoader, loaderProps } = createLoader({
			deltaConnectionServer,
		});

		const container = asLegacyAlpha(
			await createDetachedContainer({
				codeDetails,
				...loaderProps,
				configProvider: {
					getRawConfig: (name) => {
						switch (name) {
							case "Fluid.Container.enableOfflineLoad":
								return true;
							default:
								return undefined;
						}
					},
				},
			}),
		);

		await container.attach(urlResolver.createCreateNewRequest("test"));

		const url = await container.getAbsoluteUrl("");
		assert(
			url !== undefined,
			"Expected container to provide a valid absolute URL, but got undefined",
		);
		const pendingLocalState = await container.getPendingLocalState();

		const frozenContainer = await loadFrozenContainerFromPendingState({
			codeLoader,
			urlResolver,
			request: {
				url,
			},
			pendingLocalState,
		});
		const frozenEntryPoint: FluidObject<TestFluidObject> =
			await frozenContainer.getEntryPoint();
		assert(
			frozenEntryPoint.ITestFluidObject !== undefined,
			"Expected frozen container entrypoint to be a valid TestFluidObject, but it was undefined",
		);
		await frozenEntryPoint.ITestFluidObject.runtime
			.uploadBlob(stringToBuffer("some random text", "utf-8"))
			.then(() => {
				assert.fail("Blob upload should not be successful on frozen container");
			})
			.catch((error) => {
				assert.strictEqual(
					error.message,
					"Operations are not supported on the FrozenDocumentStorageService.",
					"Error message mismatch",
				);
			});
	});

	it("snapshot refresh on frozen container", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const { urlResolver, codeDetails, codeLoader, loaderProps } = createLoader({
			deltaConnectionServer,
		});
		const container = asLegacyAlpha(
			await createDetachedContainer({
				codeDetails,
				...loaderProps,
				configProvider: {
					getRawConfig: (name) => {
						switch (name) {
							case "Fluid.Container.enableOfflineLoad":
							case "Fluid.Container.enableOfflineSnapshotRefresh":
								return true;
							case "Fluid.Container.snapshotRefreshTimeoutMs":
								return snapshotRefreshTimeoutMs;
							default:
								return undefined;
						}
					},
				},
			}),
		);

		await container.attach(urlResolver.createCreateNewRequest("test"));

		const url = await container.getAbsoluteUrl("");
		assert(
			url !== undefined,
			"Expected container to provide a valid absolute URL, but got undefined",
		);
		const pendingLocalState = await container.getPendingLocalState();

		const frozenContainer = await loadFrozenContainerFromPendingState({
			codeLoader,
			urlResolver,
			request: {
				url,
			},
			pendingLocalState,
		});

		clock.tick(snapshotRefreshTimeoutMs);

		const frozenEntryPoint: FluidObject<TestFluidObject> =
			await frozenContainer.getEntryPoint();
		assert(
			frozenEntryPoint.ITestFluidObject !== undefined,
			"Expected frozen container entrypoint to be a valid TestFluidObject, but it was undefined",
		);
	});
});
