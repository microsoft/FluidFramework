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
	type ContainerAlpha,
} from "@fluidframework/container-loader/internal";
import type { FluidObject } from "@fluidframework/core-interfaces/internal";
import type { ISharedMap } from "@fluidframework/map/internal";
import { SharedMap } from "@fluidframework/map/internal";
import { isFluidHandle, toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { timeoutPromise, type TestFluidObject } from "@fluidframework/test-utils/internal";

import { createLoader, type CreateLoaderDefaultResults } from "../utils.js";

const toComparableArray = (dir: ISharedMap): [string, unknown][] =>
	[...dir.entries()].map(([key, value]) => [
		key,
		isFluidHandle(value) ? toFluidHandleInternal(value).absolutePath : value,
	]);

describe("loadFrozenContainerFromPendingState", () => {
	let container: ContainerAlpha;
	let rootObject: ISharedMap;
	let urlResolver: CreateLoaderDefaultResults["urlResolver"];
	let codeLoader: CreateLoaderDefaultResults["codeLoader"];

	beforeEach(async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const loader = createLoader({
			deltaConnectionServer,
		});
		const { codeDetails, loaderProps } = loader;
		urlResolver = loader.urlResolver;
		codeLoader = loader.codeLoader;

		container = asLegacyAlpha(
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
		rootObject = ITestFluidObject.root;
	});

	it("loadFrozenContainerFromPendingState", async () => {
		for (let i = 0; i < 10; i++) {
			rootObject.set(`detached-${i}`, i);
		}

		await container.attach(urlResolver.createCreateNewRequest("test"));
		for (let i = 0; i < 10; i++) {
			rootObject.set(`attached-${i}`, i);
		}
		const url = await container.getAbsoluteUrl("");
		assert(
			url !== undefined,
			"Expected container to provide a valid absolute URL, but got undefined",
		);

		container.disconnect();
		for (let i = 0; i < 10; i++) {
			rootObject.set(`disconnected-${i}`, i);
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
			toComparableArray(rootObject),
			"Expected frozen container's data to match the original container's state after pending local state was captured.",
		);

		container.connect();
		for (let i = 0; i < 10; i++) {
			rootObject.set(`afterGetPendingLocalState-${i}`, i);
		}

		if (container.isDirty) {
			await timeoutPromise((resolve) => container.once("saved", () => resolve()));
		}
		assert.notDeepEqual(
			frozenEntries,
			toComparableArray(rootObject),
			"Expected frozen container's data to differ from the original container after new changes were made post-pending state.",
		);
		assert.deepEqual(
			frozenEntries,
			toComparableArray(frozenEntryPoint.ITestFluidObject.root),
			"Expected frozen container's data to remain unchanged after new changes in the original container.",
		);
	});

	it("frozen container loads DDS", async () => {
		const { ITestFluidObject }: FluidObject<TestFluidObject> =
			(await container.getEntryPoint()) ?? {};
		assert(
			ITestFluidObject !== undefined,
			"Expected entrypoint to be a valid TestFluidObject, but it was undefined",
		);
		const newSharedMap1 = SharedMap.create(ITestFluidObject.runtime);
		// Set a value while in local state.
		newSharedMap1.set("newKey", "newValue");
		rootObject.set("newSharedMapId", newSharedMap1.handle);

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
		const newSharedMap1Retrieved = (await frozenEntryPoint.ITestFluidObject.root
			.get("newSharedMapId")
			.get()) as ISharedMap;
		assert(
			newSharedMap1Retrieved !== undefined,
			"Expected to retrieve newSharedMap1 from frozen container, but it was undefined",
		);
		assert(
			newSharedMap1Retrieved.get("newKey") === "newValue",
			"Expected newSharedMap1 to have key 'newKey' with value 'newValue', but it did not",
		);
	});

	it("uploading blob on frozen container", async () => {
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
		try {
			await frozenEntryPoint.ITestFluidObject.runtime.uploadBlob(
				stringToBuffer("some random text", "utf-8"),
			);
			assert.fail("uploadBlob should have failed");
		} catch (error: any) {
			assert.strictEqual(
				error.message,
				"Operations are not supported on the FrozenDocumentStorageService.",
				"Error message mismatch",
			);
		}
	});

	it("trying to attach a frozen container", async () => {
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
		try {
			await frozenContainer.attach(urlResolver.createCreateNewRequest("test"));
			assert.fail("attach should have failed");
		} catch (error: any) {
			assert.strictEqual(
				error.message,
				"The Container is not in a valid state for attach [loaded] and [Attached]",
				"Error message mismatch",
			);
		}
	});
});
