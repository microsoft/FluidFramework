/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import {
	asLegacyAlpha,
	createDetachedContainer,
	loadFrozenContainerFromPendingState,
} from "@fluidframework/container-loader/internal";
import type { FluidObject } from "@fluidframework/core-interfaces/internal";
import { SharedMap, type ISharedMap } from "@fluidframework/map/internal";
import { isFluidHandle, toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { timeoutPromise, type TestFluidObject } from "@fluidframework/test-utils/internal";

import { createLoader } from "../utils.js";

const toComparableArray = (dir: ISharedMap): [string, unknown][] =>
	[...dir.entries()].map(([key, value]) => [
		key,
		isFluidHandle(value) ? toFluidHandleInternal(value).absolutePath : value,
	]);

// initialize loader and create a container function
const initialize = async () => {
	const deltaConnectionServer = LocalDeltaConnectionServer.create();

	const { urlResolver, codeDetails, codeLoader, loaderProps, documentServiceFactory } =
		createLoader({
			deltaConnectionServer,
		});

	const container = asLegacyAlpha(
		await createDetachedContainer({
			codeDetails,
			...loaderProps,
		}),
	);
	const { ITestFluidObject }: FluidObject<TestFluidObject> =
		(await container.getEntryPoint()) ?? {};
	assert(
		ITestFluidObject !== undefined,
		"Expected entrypoint to be a valid TestFluidObject, but it was undefined",
	);
	return {
		container,
		ITestFluidObject,
		urlResolver,
		codeLoader,
		documentServiceFactory,
		deltaConnectionServer,
		loaderProps,
	};
};

describe("loadFrozenContainerFromPendingState", () => {
	it("loadFrozenContainerFromPendingState", async () => {
		const { container, ITestFluidObject, urlResolver, codeLoader, documentServiceFactory } =
			await initialize();

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
			documentServiceFactory,
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

	it("frozen container loads DDS", async () => {
		const { container, ITestFluidObject, urlResolver, codeLoader, documentServiceFactory } =
			await initialize();
		const newSharedMap1 = SharedMap.create(ITestFluidObject.runtime);
		// Set a value while in local state.
		newSharedMap1.set("newKey", "newValue");
		ITestFluidObject.root.set("newSharedMapId", newSharedMap1.handle);

		await container.attach(urlResolver.createCreateNewRequest("test"));
		const url = await container.getAbsoluteUrl("");
		assert(
			url !== undefined,
			"Expected container to provide a valid absolute URL, but got undefined",
		);
		const pendingLocalState = await container.getPendingLocalState();

		const frozenContainer = await loadFrozenContainerFromPendingState({
			codeLoader,
			documentServiceFactory,
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

	it("frozen container loads blob", async () => {
		const { container, ITestFluidObject, urlResolver, codeLoader, documentServiceFactory } =
			await initialize();
		await container.attach(urlResolver.createCreateNewRequest("test"));
		const blobHandle = await ITestFluidObject.runtime.uploadBlob(
			stringToBuffer("test", "utf-8"),
		);
		// Set a value while in local state.
		ITestFluidObject.root.set("newBlobId", blobHandle);
		const url = await container.getAbsoluteUrl("");
		assert(
			url !== undefined,
			"Expected container to provide a valid absolute URL, but got undefined",
		);
		const pendingLocalState = await container.getPendingLocalState();

		const frozenContainer = await loadFrozenContainerFromPendingState({
			codeLoader,
			documentServiceFactory,
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
		const newBlobRetrieved = await frozenEntryPoint.ITestFluidObject.root
			.get("newBlobId")
			.get();
		assert(
			newBlobRetrieved !== undefined,
			"Expected to retrieve newBlobRetrieved from frozen container, but it was undefined",
		);
		assert(
			bufferToString(newBlobRetrieved, "utf-8") === "test",
			"Expected newBlobRetrieved to have value 'test', but it did not",
		);
	});

	it("uploading blob on frozen container", async () => {
		const { container, urlResolver, codeLoader, documentServiceFactory } = await initialize();
		await container.attach(urlResolver.createCreateNewRequest("test"));

		const url = await container.getAbsoluteUrl("");
		assert(
			url !== undefined,
			"Expected container to provide a valid absolute URL, but got undefined",
		);
		const pendingLocalState = await container.getPendingLocalState();

		const frozenContainer = await loadFrozenContainerFromPendingState({
			codeLoader,
			documentServiceFactory,
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
		const { container, urlResolver, codeLoader, documentServiceFactory } = await initialize();
		await container.attach(urlResolver.createCreateNewRequest("test"));

		const url = await container.getAbsoluteUrl("");
		assert(
			url !== undefined,
			"Expected container to provide a valid absolute URL, but got undefined",
		);
		const pendingLocalState = await container.getPendingLocalState();

		const frozenContainer = await loadFrozenContainerFromPendingState({
			codeLoader,
			documentServiceFactory,
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
