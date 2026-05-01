/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import {
	asLegacyAlpha,
	createDetachedContainer,
	createFrozenDocumentServiceFactory,
	loadFrozenContainerFromPendingState,
	type ContainerAlpha,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import type { FluidObject } from "@fluidframework/core-interfaces/internal";
import type {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import { SharedMap, type ISharedMap } from "@fluidframework/map/internal";
import { isFluidHandle, toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import {
	LocalDeltaConnectionServer,
	type ILocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import {
	timeoutPromise,
	type ITestFluidObject,
	type LocalCodeLoader,
	type TestFluidObject,
} from "@fluidframework/test-utils/internal";

import { createLoader } from "../utils.js";

const toComparableArray = (dir: ISharedMap): [string, unknown][] =>
	[...dir.entries()].map(([key, value]) => [
		key,
		isFluidHandle(value) ? toFluidHandleInternal(value).absolutePath : value,
	]);

// initialize loader and create a container function
const initialize = async (): Promise<{
	container: ContainerAlpha;
	ITestFluidObject: ITestFluidObject;
	urlResolver: LocalResolver;
	codeLoader: LocalCodeLoader;
	documentServiceFactory: LocalDocumentServiceFactory;
	deltaConnectionServer: ILocalDeltaConnectionServer;
	loaderProps: ILoaderProps;
}> => {
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

	describe("readOnly: false (writable frozen container)", () => {
		it("surfaces as not readonly", async () => {
			const { container, ITestFluidObject, urlResolver, codeLoader, documentServiceFactory } =
				await initialize();
			await container.attach(urlResolver.createCreateNewRequest("test"));
			ITestFluidObject.root.set("seed", "value");
			const url = await container.getAbsoluteUrl("");
			assert(url !== undefined, "Expected container to provide a valid absolute URL");
			const pendingLocalState = await container.getPendingLocalState();

			const frozenContainer = await loadFrozenContainerFromPendingState({
				codeLoader,
				documentServiceFactory,
				urlResolver,
				request: { url },
				pendingLocalState,
				readOnly: false,
			});

			assert.strictEqual(
				frozenContainer.readOnlyInfo.readonly,
				false,
				"Expected writable frozen container to report readonly === false",
			);
			assert.strictEqual(
				frozenContainer.closed,
				false,
				"Expected writable frozen container to remain open",
			);
			assert.strictEqual(
				frozenContainer.disposed,
				false,
				"Expected writable frozen container to not be disposed",
			);
		});

		it("accepts local writes without closing the container", async () => {
			const { container, ITestFluidObject, urlResolver, codeLoader, documentServiceFactory } =
				await initialize();
			await container.attach(urlResolver.createCreateNewRequest("test"));
			ITestFluidObject.root.set("seed", "value");
			const url = await container.getAbsoluteUrl("");
			assert(url !== undefined, "Expected container to provide a valid absolute URL");
			const pendingLocalState = await container.getPendingLocalState();

			const frozenContainer = await loadFrozenContainerFromPendingState({
				codeLoader,
				documentServiceFactory,
				urlResolver,
				request: { url },
				pendingLocalState,
				readOnly: false,
			});
			const frozenEntryPoint: FluidObject<TestFluidObject> =
				await frozenContainer.getEntryPoint();
			assert(
				frozenEntryPoint.ITestFluidObject !== undefined,
				"Expected frozen container entrypoint to be a valid TestFluidObject",
			);

			// Read-only variant short-circuits via storageOnly so submissions never reach the
			// runtime. Writable variant accepts them: the connectionManager attempts a read→write
			// upgrade on the first submit, which FrozenDocumentService hangs, so submitted ops
			// stay in the runtime's pendingStateManager and never reach the wire.
			for (let i = 0; i < 5; i++) {
				frozenEntryPoint.ITestFluidObject.root.set(`writableOnly-${i}`, i);
			}

			assert.strictEqual(
				frozenContainer.closed,
				false,
				"Expected writable frozen container to remain open after local writes",
			);
			assert.strictEqual(
				frozenEntryPoint.ITestFluidObject.root.get("writableOnly-0"),
				0,
				"Expected local write to be visible in the writable frozen container",
			);
			assert.strictEqual(
				frozenEntryPoint.ITestFluidObject.root.get("writableOnly-4"),
				4,
				"Expected last local write to be visible in the writable frozen container",
			);
		});

		it("does not propagate local writes to other clients", async () => {
			const { container, ITestFluidObject, urlResolver, codeLoader, documentServiceFactory } =
				await initialize();
			await container.attach(urlResolver.createCreateNewRequest("test"));
			ITestFluidObject.root.set("seed", "value");
			const url = await container.getAbsoluteUrl("");
			assert(url !== undefined, "Expected container to provide a valid absolute URL");
			if (container.isDirty) {
				await timeoutPromise((resolve) => container.once("saved", () => resolve()));
			}
			const pendingLocalState = await container.getPendingLocalState();

			const frozenContainer = await loadFrozenContainerFromPendingState({
				codeLoader,
				documentServiceFactory,
				urlResolver,
				request: { url },
				pendingLocalState,
				readOnly: false,
			});
			const frozenEntryPoint: FluidObject<TestFluidObject> =
				await frozenContainer.getEntryPoint();
			assert(
				frozenEntryPoint.ITestFluidObject !== undefined,
				"Expected frozen container entrypoint to be a valid TestFluidObject",
			);

			frozenEntryPoint.ITestFluidObject.root.set("ghost", "should-not-propagate");

			// Force a roundtrip on the original (live) container so any propagated op would have
			// landed by now.
			ITestFluidObject.root.set("liveRoundtrip", "tick");
			if (container.isDirty) {
				await timeoutPromise((resolve) => container.once("saved", () => resolve()));
			}

			assert.strictEqual(
				ITestFluidObject.root.get("ghost"),
				undefined,
				"Expected writes from a writable frozen container to NOT reach other clients",
			);
		});

		it("submitting a signal does not close the container", async () => {
			const { container, ITestFluidObject, urlResolver, codeLoader, documentServiceFactory } =
				await initialize();
			await container.attach(urlResolver.createCreateNewRequest("test"));
			ITestFluidObject.root.set("seed", "value");
			const url = await container.getAbsoluteUrl("");
			assert(url !== undefined, "Expected container to provide a valid absolute URL");
			const pendingLocalState = await container.getPendingLocalState();

			const frozenContainer = await loadFrozenContainerFromPendingState({
				codeLoader,
				documentServiceFactory,
				urlResolver,
				request: { url },
				pendingLocalState,
				readOnly: false,
			});
			const frozenEntryPoint: FluidObject<TestFluidObject> =
				await frozenContainer.getEntryPoint();
			assert(
				frozenEntryPoint.ITestFluidObject !== undefined,
				"Expected frozen container entrypoint to be a valid TestFluidObject",
			);

			frozenEntryPoint.ITestFluidObject.runtime.submitSignal("test-signal", { ping: 1 });

			assert.strictEqual(
				frozenContainer.closed,
				false,
				"Expected writable frozen container to remain open after submitting a signal",
			);
			assert.strictEqual(
				frozenContainer.disposed,
				false,
				"Expected writable frozen container to not be disposed after submitting a signal",
			);
		});

		it("captures local writes in getPendingLocalState() and round-trips through a second frozen load", async () => {
			const { container, ITestFluidObject, urlResolver, codeLoader, documentServiceFactory } =
				await initialize();
			await container.attach(urlResolver.createCreateNewRequest("test"));
			ITestFluidObject.root.set("seed", "value");
			const url = await container.getAbsoluteUrl("");
			assert(url !== undefined, "Expected container to provide a valid absolute URL");
			if (container.isDirty) {
				await timeoutPromise((resolve) => container.once("saved", () => resolve()));
			}
			const initialPending = await container.getPendingLocalState();

			const frozenContainer = asLegacyAlpha(
				await loadFrozenContainerFromPendingState({
					codeLoader,
					documentServiceFactory,
					urlResolver,
					request: { url },
					pendingLocalState: initialPending,
					readOnly: false,
				}),
			);
			const frozenEntryPoint: FluidObject<TestFluidObject> =
				await frozenContainer.getEntryPoint();
			assert(
				frozenEntryPoint.ITestFluidObject !== undefined,
				"Expected frozen container entrypoint to be a valid TestFluidObject",
			);

			for (let i = 0; i < 5; i++) {
				frozenEntryPoint.ITestFluidObject.root.set(`pending-${i}`, i);
			}

			// Capture pending state from the writable-frozen container — the load-bearing
			// invariant: edits made post-load must round-trip through getPendingLocalState().
			const layeredPending = await frozenContainer.getPendingLocalState();
			assert.notStrictEqual(
				layeredPending,
				initialPending,
				"Expected getPendingLocalState() to capture additional ops from the writable frozen container",
			);

			// Load a second writable-frozen container from the layered pending state and verify
			// the layered edits are visible.
			const secondFrozen = await loadFrozenContainerFromPendingState({
				codeLoader,
				documentServiceFactory,
				urlResolver,
				request: { url },
				pendingLocalState: layeredPending,
				readOnly: false,
			});
			const secondEntryPoint: FluidObject<TestFluidObject> =
				await secondFrozen.getEntryPoint();
			assert(
				secondEntryPoint.ITestFluidObject !== undefined,
				"Expected second frozen entrypoint to be a valid TestFluidObject",
			);
			for (let i = 0; i < 5; i++) {
				assert.strictEqual(
					secondEntryPoint.ITestFluidObject.root.get(`pending-${i}`),
					i,
					`Expected pending-${i} from layered pending state to be visible in second frozen load`,
				);
			}
			assert.strictEqual(
				secondEntryPoint.ITestFluidObject.root.get("seed"),
				"value",
				"Expected seed from original snapshot to remain visible in second frozen load",
			);
		});

		it("honors readOnly: false when wrapping an already-frozen factory with readOnly: true", async () => {
			const { container, ITestFluidObject, urlResolver, codeLoader, documentServiceFactory } =
				await initialize();
			await container.attach(urlResolver.createCreateNewRequest("test"));
			ITestFluidObject.root.set("seed", "value");
			const url = await container.getAbsoluteUrl("");
			assert(url !== undefined, "Expected container to provide a valid absolute URL");
			const pendingLocalState = await container.getPendingLocalState();

			// Pre-wrap with readOnly: true (the default), then ask loadFrozenContainerFromPendingState
			// for readOnly: false. The most recent intent should win — without the rewrap-on-mismatch
			// logic this would silently surface as read-only.
			const preWrapped = createFrozenDocumentServiceFactory(documentServiceFactory, true);
			const frozenContainer = await loadFrozenContainerFromPendingState({
				codeLoader,
				documentServiceFactory: preWrapped,
				urlResolver,
				request: { url },
				pendingLocalState,
				readOnly: false,
			});

			assert.strictEqual(
				frozenContainer.readOnlyInfo.readonly,
				false,
				"Expected readOnly: false to win over an already-wrapped readOnly: true factory",
			);
		});

		it("loads with allowReconnect: false (forced-write initial connect)", async () => {
			const { container, ITestFluidObject, urlResolver, codeLoader, documentServiceFactory } =
				await initialize();
			await container.attach(urlResolver.createCreateNewRequest("test"));
			ITestFluidObject.root.set("seed", "value");
			const url = await container.getAbsoluteUrl("");
			assert(url !== undefined, "Expected container to provide a valid absolute URL");
			if (container.isDirty) {
				await timeoutPromise((resolve) => container.once("saved", () => resolve()));
			}
			const initialPending = await container.getPendingLocalState();

			// allowReconnect: false makes Container.connectToDeltaStream force mode = "write" on
			// the very first connect. Without first-vs-subsequent tracking in FrozenDocumentService,
			// that initial connect would be intercepted by the upgrade-hang path and the load
			// would never complete.
			const frozenContainer = asLegacyAlpha(
				await loadFrozenContainerFromPendingState({
					codeLoader,
					documentServiceFactory,
					urlResolver,
					request: { url },
					pendingLocalState: initialPending,
					readOnly: false,
					allowReconnect: false,
				}),
			);

			assert.strictEqual(
				frozenContainer.readOnlyInfo.readonly,
				false,
				"Expected writable frozen container with allowReconnect: false to report readonly === false",
			);
			assert.strictEqual(
				frozenContainer.closed,
				false,
				"Expected writable frozen container with allowReconnect: false to remain open",
			);

			const frozenEntryPoint: FluidObject<TestFluidObject> =
				await frozenContainer.getEntryPoint();
			assert(
				frozenEntryPoint.ITestFluidObject !== undefined,
				"Expected frozen container entrypoint to be a valid TestFluidObject",
			);
			for (let i = 0; i < 3; i++) {
				frozenEntryPoint.ITestFluidObject.root.set(`noReconnect-${i}`, i);
			}

			// Yield enough microtasks to let any read→write reconnect attempt fire. Under
			// ReconnectMode.Never (allowReconnect: false), an unsuppressed reconnect would
			// call closeHandler and close the container asynchronously. The
			// ConnectionManager.sendMessages FrozenDeltaStream short-circuit prevents that.
			for (let i = 0; i < 10; i++) {
				await Promise.resolve();
			}
			assert.strictEqual(
				frozenContainer.closed,
				false,
				"Expected writable frozen container with allowReconnect: false to remain open after writes (no async close from reconnect attempt)",
			);

			// Subsequent writes must continue to apply locally — proves the suppression of the
			// upgrade reconnect doesn't tear down the connection or wedge the runtime.
			for (let i = 3; i < 6; i++) {
				frozenEntryPoint.ITestFluidObject.root.set(`noReconnect-${i}`, i);
			}

			// Pending state must capture all layered edits.
			const layeredPending = await frozenContainer.getPendingLocalState();
			assert.notStrictEqual(
				layeredPending,
				initialPending,
				"Expected getPendingLocalState() to capture additional ops with allowReconnect: false",
			);
			const replay = await loadFrozenContainerFromPendingState({
				codeLoader,
				documentServiceFactory,
				urlResolver,
				request: { url },
				pendingLocalState: layeredPending,
				readOnly: false,
			});
			const replayEntry: FluidObject<TestFluidObject> = await replay.getEntryPoint();
			assert(replayEntry.ITestFluidObject !== undefined);
			for (let i = 0; i < 6; i++) {
				assert.strictEqual(
					replayEntry.ITestFluidObject.root.get(`noReconnect-${i}`),
					i,
					`Expected noReconnect-${i} (pre- and post-microtask-flush writes) to round-trip through pending state`,
				);
			}
		});

		it("loads with a non-interactive client (forced-write initial connect)", async () => {
			const { container, ITestFluidObject, urlResolver, codeLoader, documentServiceFactory } =
				await initialize();
			await container.attach(urlResolver.createCreateNewRequest("test"));
			ITestFluidObject.root.set("seed", "value");
			const url = await container.getAbsoluteUrl("");
			assert(url !== undefined, "Expected container to provide a valid absolute URL");
			if (container.isDirty) {
				await timeoutPromise((resolve) => container.once("saved", () => resolve()));
			}
			const initialPending = await container.getPendingLocalState();

			// Non-interactive client also forces mode = "write" on the first connect — same path
			// in Container.connectToDeltaStream as allowReconnect: false. Different forcing
			// condition, identical observed behavior at the FrozenDocumentService boundary.
			const frozenContainer = asLegacyAlpha(
				await loadFrozenContainerFromPendingState({
					codeLoader,
					documentServiceFactory,
					urlResolver,
					request: { url },
					pendingLocalState: initialPending,
					readOnly: false,
					clientDetailsOverride: {
						capabilities: { interactive: false },
					},
				}),
			);

			assert.strictEqual(
				frozenContainer.readOnlyInfo.readonly,
				false,
				"Expected writable frozen container with non-interactive client to report readonly === false",
			);
			assert.strictEqual(
				frozenContainer.closed,
				false,
				"Expected writable frozen container with non-interactive client to remain open",
			);

			const frozenEntryPoint: FluidObject<TestFluidObject> =
				await frozenContainer.getEntryPoint();
			assert(
				frozenEntryPoint.ITestFluidObject !== undefined,
				"Expected frozen container entrypoint to be a valid TestFluidObject",
			);
			for (let i = 0; i < 3; i++) {
				frozenEntryPoint.ITestFluidObject.root.set(`nonInteractive-${i}`, i);
			}

			const layeredPending = await frozenContainer.getPendingLocalState();
			assert.notStrictEqual(
				layeredPending,
				initialPending,
				"Expected getPendingLocalState() to capture additional ops with non-interactive client",
			);
		});

		it("dispose() completes while the read→write upgrade connect is hung", async () => {
			const { container, ITestFluidObject, urlResolver, codeLoader, documentServiceFactory } =
				await initialize();
			await container.attach(urlResolver.createCreateNewRequest("test"));
			ITestFluidObject.root.set("seed", "value");
			const url = await container.getAbsoluteUrl("");
			assert(url !== undefined, "Expected container to provide a valid absolute URL");
			if (container.isDirty) {
				await timeoutPromise((resolve) => container.once("saved", () => resolve()));
			}
			const pendingLocalState = await container.getPendingLocalState();

			const frozenContainer = await loadFrozenContainerFromPendingState({
				codeLoader,
				documentServiceFactory,
				urlResolver,
				request: { url },
				pendingLocalState,
				readOnly: false,
			});
			const frozenEntryPoint: FluidObject<TestFluidObject> =
				await frozenContainer.getEntryPoint();
			assert(
				frozenEntryPoint.ITestFluidObject !== undefined,
				"Expected frozen container entrypoint to be a valid TestFluidObject",
			);

			// End-to-end smoke for the writable-frozen lifecycle: writes are accepted, the
			// container stays Connected (sendMessages drops them at the FrozenDeltaStream
			// short-circuit), and dispose() then runs cleanly. The pendingConnectRejecters
			// drain path is no longer exercised here in normal flow — the focused unit test
			// in container-loader/src/test/frozenServices.spec.ts drives connectToDeltaStream(
			// {mode: "write"}) directly to verify that.
			frozenEntryPoint.ITestFluidObject.root.set("aWrite", 1);
			await new Promise<void>((resolve) => setTimeout(resolve, 200));

			frozenContainer.dispose();
			assert.strictEqual(
				frozenContainer.disposed,
				true,
				"Expected writable frozen container to dispose cleanly after a local write",
			);
		});

		it("close() runs cleanly on a writable-frozen container after a local write", async () => {
			const { container, ITestFluidObject, urlResolver, codeLoader, documentServiceFactory } =
				await initialize();
			await container.attach(urlResolver.createCreateNewRequest("test"));
			ITestFluidObject.root.set("seed", "value");
			const url = await container.getAbsoluteUrl("");
			assert(url !== undefined, "Expected container to provide a valid absolute URL");
			if (container.isDirty) {
				await timeoutPromise((resolve) => container.once("saved", () => resolve()));
			}
			const pendingLocalState = await container.getPendingLocalState();

			const frozenContainer = await loadFrozenContainerFromPendingState({
				codeLoader,
				documentServiceFactory,
				urlResolver,
				request: { url },
				pendingLocalState,
				readOnly: false,
			});
			const frozenEntryPoint: FluidObject<TestFluidObject> =
				await frozenContainer.getEntryPoint();
			assert(
				frozenEntryPoint.ITestFluidObject !== undefined,
				"Expected frozen container entrypoint to be a valid TestFluidObject",
			);

			frozenEntryPoint.ITestFluidObject.root.set("aWrite", 1);
			await new Promise<void>((resolve) => setTimeout(resolve, 200));

			// close() does not propagate to service.dispose() — the documented benign-leak
			// tradeoff for any pending rejecters that might exist on defense-in-depth paths.
			// In normal writable-frozen flow no such rejecters exist (sendMessages drops at the
			// FrozenDeltaStream short-circuit), but the contract worth pinning here is that
			// close() itself returns and the container observes closed === true.
			frozenContainer.close();
			assert.strictEqual(
				frozenContainer.closed,
				true,
				"Expected writable frozen container to close cleanly after a local write",
			);
		});

		it("captures writes batched across timer/microtask boundaries", async () => {
			const { container, ITestFluidObject, urlResolver, codeLoader, documentServiceFactory } =
				await initialize();
			await container.attach(urlResolver.createCreateNewRequest("test"));
			ITestFluidObject.root.set("seed", "value");
			const url = await container.getAbsoluteUrl("");
			assert(url !== undefined, "Expected container to provide a valid absolute URL");
			if (container.isDirty) {
				await timeoutPromise((resolve) => container.once("saved", () => resolve()));
			}
			const initialPending = await container.getPendingLocalState();

			const frozenContainer = asLegacyAlpha(
				await loadFrozenContainerFromPendingState({
					codeLoader,
					documentServiceFactory,
					urlResolver,
					request: { url },
					pendingLocalState: initialPending,
					readOnly: false,
				}),
			);
			const frozenEntryPoint: FluidObject<TestFluidObject> =
				await frozenContainer.getEntryPoint();
			assert(
				frozenEntryPoint.ITestFluidObject !== undefined,
				"Expected frozen container entrypoint to be a valid TestFluidObject",
			);

			// First write — sendMessages drops it at the FrozenDeltaStream short-circuit and
			// the runtime accumulates it in pendingStateManager.
			frozenEntryPoint.ITestFluidObject.root.set("preDisconnect", "first");

			// Bounded wait — proves the writable-frozen container survives a non-trivial
			// idle interval (no async close from any deferred reconnect work) before the
			// next write batch.
			await new Promise<void>((resolve) => setTimeout(resolve, 500));

			// Second write batch — the runtime continues to apply locally and accumulate.
			frozenEntryPoint.ITestFluidObject.root.set("postDisconnect", "second");

			assert.strictEqual(
				frozenEntryPoint.ITestFluidObject.root.get("preDisconnect"),
				"first",
				"Expected first-batch write to be locally visible",
			);
			assert.strictEqual(
				frozenEntryPoint.ITestFluidObject.root.get("postDisconnect"),
				"second",
				"Expected second-batch write to be locally visible",
			);

			// Both batches should round-trip through getPendingLocalState — proving the
			// writable-frozen container continues to capture pending state across timer
			// boundaries.
			const layeredPending = await frozenContainer.getPendingLocalState();
			const secondFrozen = await loadFrozenContainerFromPendingState({
				codeLoader,
				documentServiceFactory,
				urlResolver,
				request: { url },
				pendingLocalState: layeredPending,
				readOnly: false,
			});
			const secondEntryPoint: FluidObject<TestFluidObject> =
				await secondFrozen.getEntryPoint();
			assert(
				secondEntryPoint.ITestFluidObject !== undefined,
				"Expected second frozen entrypoint to be a valid TestFluidObject",
			);
			assert.strictEqual(
				secondEntryPoint.ITestFluidObject.root.get("preDisconnect"),
				"first",
				"Expected first-batch write to round-trip through pending state",
			);
			assert.strictEqual(
				secondEntryPoint.ITestFluidObject.root.get("postDisconnect"),
				"second",
				"Expected second-batch write to round-trip through pending state",
			);
		});
	});
});
