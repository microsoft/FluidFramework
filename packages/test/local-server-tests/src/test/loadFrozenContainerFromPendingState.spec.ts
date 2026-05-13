/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct/internal";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	createFrozenDocumentServiceFactory,
	loadExistingContainer,
	loadFrozenContainerFromPendingState,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import type { FluidObject, ILocalFluidHandle } from "@fluidframework/core-interfaces/internal";
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
	TestFluidObjectFactory,
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
const initialize = async (options?: {
	createBlobPayloadPending?: true;
}): Promise<{
	container: IContainer;
	ITestFluidObject: ITestFluidObject;
	urlResolver: LocalResolver;
	codeLoader: LocalCodeLoader;
	documentServiceFactory: LocalDocumentServiceFactory;
	deltaConnectionServer: ILocalDeltaConnectionServer;
	loaderProps: ILoaderProps;
}> => {
	const deltaConnectionServer = LocalDeltaConnectionServer.create();

	// Only pass a custom runtimeFactory when we need non-default runtime options; otherwise
	// fall through to createLoader's default so we don't perturb the existing tests above.
	const runtimeFactory =
		options?.createBlobPayloadPending === undefined
			? undefined
			: (() => {
					const defaultDataStoreFactory = new TestFluidObjectFactory(
						[["map", SharedMap.getFactory()]],
						"default",
					);
					return new ContainerRuntimeFactoryWithDefaultDataStore({
						defaultFactory: defaultDataStoreFactory,
						registryEntries: [
							[defaultDataStoreFactory.type, Promise.resolve(defaultDataStoreFactory)],
						],
						runtimeOptions: {
							// createBlobPayloadPending requires explicitSchemaControl.
							explicitSchemaControl: true,
							createBlobPayloadPending: options.createBlobPayloadPending,
						},
					});
				})();

	const { urlResolver, codeDetails, codeLoader, loaderProps, documentServiceFactory } =
		createLoader({
			deltaConnectionServer,
			...(runtimeFactory === undefined ? {} : { runtimeFactory }),
		});

	const container = await createDetachedContainer({
		codeDetails,
		...loaderProps,
	});
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
			// runtime. Writable variant accepts them: ConnectionManager.sendMessages drops
			// outbound messages at the WritableFrozenDeltaStream short-circuit, so submitted
			// ops stay in the runtime's pendingStateManager and never reach the wire.
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

			const frozenContainer = await loadFrozenContainerFromPendingState({
				codeLoader,
				documentServiceFactory,
				urlResolver,
				request: { url },
				pendingLocalState: initialPending,
				readOnly: false,
			});
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
			const frozenContainer = await loadFrozenContainerFromPendingState({
				codeLoader,
				documentServiceFactory,
				urlResolver,
				request: { url },
				pendingLocalState: initialPending,
				readOnly: false,
				allowReconnect: false,
			});

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
			const frozenContainer = await loadFrozenContainerFromPendingState({
				codeLoader,
				documentServiceFactory,
				urlResolver,
				request: { url },
				pendingLocalState: initialPending,
				readOnly: false,
				clientDetailsOverride: {
					capabilities: { interactive: false },
				},
			});

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

		it("dispose() runs cleanly on a writable-frozen container after a local write", async () => {
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
			// container stays Connected (sendMessages drops them at the WritableFrozenDeltaStream
			// short-circuit), and dispose() then runs cleanly.
			frozenEntryPoint.ITestFluidObject.root.set("aWrite", 1);

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

			// close() does not propagate to service.dispose(). In writable-frozen flow that's
			// fine: sendMessages drops outbound writes at the WritableFrozenDeltaStream
			// short-circuit, so no connect attempts are pending. The contract worth pinning
			// here is that close() returns and the container observes closed === true.
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

			const frozenContainer = await loadFrozenContainerFromPendingState({
				codeLoader,
				documentServiceFactory,
				urlResolver,
				request: { url },
				pendingLocalState: initialPending,
				readOnly: false,
			});
			const frozenEntryPoint: FluidObject<TestFluidObject> =
				await frozenContainer.getEntryPoint();
			assert(
				frozenEntryPoint.ITestFluidObject !== undefined,
				"Expected frozen container entrypoint to be a valid TestFluidObject",
			);

			// First write — sendMessages drops it at the WritableFrozenDeltaStream
			// short-circuit and the runtime accumulates it in pendingStateManager.
			frozenEntryPoint.ITestFluidObject.root.set("preDelay", "first");

			// Cross a single macrotask boundary between the two write batches. The test's
			// purpose is that the runtime continues to capture pending state across timer
			// boundaries — a `setTimeout(0)` is sufficient to land on a fresh macrotask.
			await new Promise<void>((resolve) => setTimeout(resolve, 0));

			// Second write batch — the runtime continues to apply locally and accumulate.
			frozenEntryPoint.ITestFluidObject.root.set("postDelay", "second");

			assert.strictEqual(
				frozenEntryPoint.ITestFluidObject.root.get("preDelay"),
				"first",
				"Expected first-batch write to be locally visible",
			);
			assert.strictEqual(
				frozenEntryPoint.ITestFluidObject.root.get("postDelay"),
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
				secondEntryPoint.ITestFluidObject.root.get("preDelay"),
				"first",
				"Expected first-batch write to round-trip through pending state",
			);
			assert.strictEqual(
				secondEntryPoint.ITestFluidObject.root.get("postDelay"),
				"second",
				"Expected second-batch write to round-trip through pending state",
			);
		});

		it("forceReadonly(true) surfaces a writable-frozen container as readonly", async () => {
			// Pins the interaction between forceReadonly (the higher-layer #11655 readonly
			// mechanism: runtime is told it is readonly and stops submitting ops) and the
			// writable-frozen short-circuit. Calling forceReadonly(true) follows the standard
			// disconnect/reconnect-as-read flow; reconnect calls FrozenDocumentService
			// .connectToDeltaStream which mints another WritableFrozenDeltaStream, but
			// _forceReadonly = true overrides readOnlyInfo.readonly to true regardless of the
			// new stream's DocWrite scope. The sendMessages short-circuit becomes
			// double-protection rather than the load-bearing layer.
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
			// Initial readonly state is covered by the dedicated `surfaces as not readonly`
			// test; this one focuses on the post-forceReadonly transition.

			// forceReadonly toggles _forceReadonly synchronously, so readOnlyInfo updates
			// without needing to await a reconnect cycle. The disconnect/reconnect-as-read
			// triggered behind it is exercised by the survives-disconnect/reconnect test.
			frozenContainer.forceReadonly?.(true);

			const info = frozenContainer.readOnlyInfo;
			assert(
				info.readonly === true,
				"Expected forceReadonly(true) to surface readOnlyInfo.readonly === true",
			);
			assert.strictEqual(
				info.forced,
				true,
				"Expected forceReadonly(true) to surface readOnlyInfo.forced === true",
			);
			assert.strictEqual(
				frozenContainer.closed,
				false,
				"Expected forceReadonly(true) to keep the writable-frozen container open",
			);
		});
	});

	// Blob behavior under both `createBlobPayloadPending` runtime modes:
	//   - undefined (legacy): `uploadBlob` awaits storage.createBlob before returning a handle.
	//   - true (pending-payload): `uploadBlob` returns a handle synchronously; storage.createBlob
	//     runs as a background task triggered by attachGraph.
	// The frozen storage service (`FrozenDocumentStorageService`) delegates `readBlob` to the
	// inner storage but throws on `createBlob`. Both modes are covered for the readonly and
	// writable frozen-load shapes to pin the storage contract under both blob lifecycles.
	for (const createBlobPayloadPending of [undefined, true] as const) {
		describe(`blob handling (createBlobPayloadPending: ${createBlobPayloadPending})`, () => {
			it("readonly frozen container reads blobs captured in pending state", async () => {
				const {
					container,
					ITestFluidObject,
					urlResolver,
					codeLoader,
					documentServiceFactory,
				} = await initialize({ createBlobPayloadPending });
				await container.attach(urlResolver.createCreateNewRequest("test"));

				const blobHandle = await ITestFluidObject.runtime.uploadBlob(
					stringToBuffer("readonly-blob", "utf-8"),
				);
				ITestFluidObject.root.set("blobId", blobHandle);

				// Ensure outbound ops (including BlobAttach) are acked before snapshotting
				// pending state, so the frozen container's inner storage can resolve the blob.
				if (container.isDirty) {
					await timeoutPromise((resolve) => container.once("saved", () => resolve()));
				}

				const url = await container.getAbsoluteUrl("");
				assert(url !== undefined, "Expected container to provide a valid absolute URL");
				const pendingLocalState = await container.getPendingLocalState();

				const frozenContainer = await loadFrozenContainerFromPendingState({
					codeLoader,
					documentServiceFactory,
					urlResolver,
					request: { url },
					pendingLocalState,
				});
				assert.strictEqual(
					frozenContainer.readOnlyInfo.readonly,
					true,
					"Expected default frozen container to report readonly === true",
				);
				const frozenEntryPoint: FluidObject<TestFluidObject> =
					await frozenContainer.getEntryPoint();
				assert(frozenEntryPoint.ITestFluidObject !== undefined);

				const retrieved = await frozenEntryPoint.ITestFluidObject.root.get("blobId").get();
				assert.strictEqual(
					bufferToString(retrieved, "utf-8"),
					"readonly-blob",
					"Expected readonly frozen container to read the blob captured in pending state",
				);
			});

			it("writable frozen container reads blobs captured in pending state", async () => {
				const {
					container,
					ITestFluidObject,
					urlResolver,
					codeLoader,
					documentServiceFactory,
				} = await initialize({ createBlobPayloadPending });
				await container.attach(urlResolver.createCreateNewRequest("test"));

				const blobHandle = await ITestFluidObject.runtime.uploadBlob(
					stringToBuffer("writable-blob", "utf-8"),
				);
				ITestFluidObject.root.set("blobId", blobHandle);

				if (container.isDirty) {
					await timeoutPromise((resolve) => container.once("saved", () => resolve()));
				}

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
				const frozenEntryPoint: FluidObject<TestFluidObject> =
					await frozenContainer.getEntryPoint();
				assert(frozenEntryPoint.ITestFluidObject !== undefined);

				const retrieved = await frozenEntryPoint.ITestFluidObject.root.get("blobId").get();
				assert.strictEqual(
					bufferToString(retrieved, "utf-8"),
					"writable-blob",
					"Expected writable frozen container to read the blob captured in pending state",
				);
			});

			it("uploadBlob on a writable frozen container is captured in pending state for later upload", async () => {
				// Adding a blob in writable-frozen mode must accrue in pending state rather than
				// publishing to storage. `FrozenDocumentStorageService.createBlob` hangs (never
				// resolves) on the writable path: the BlobManager keeps the blob in `uploading`
				// state in `localBlobCache`, `getPendingBlobs` downgrades it to `localOnly` in
				// pending state, and a subsequent live load runs `sharePendingBlobs` to complete
				// the upload against real storage.
				//
				// Only pending-payload mode (`createBlobPayloadPending: true`) is fully usable
				// here. In legacy mode `uploadBlob` awaits the (hanging) storage call and never
				// returns — so callers cannot get the handle to write into a DDS, and we just
				// verify the hang is non-fatal and that the container stays open.
				const { container, urlResolver, codeLoader, documentServiceFactory, loaderProps } =
					await initialize({ createBlobPayloadPending });
				await container.attach(urlResolver.createCreateNewRequest("test"));

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
				assert(frozenEntryPoint.ITestFluidObject !== undefined);
				const frozenFluidObject = frozenEntryPoint.ITestFluidObject;

				const blobContents = "freshly-added-on-frozen";
				const newBlob = stringToBuffer(blobContents, "utf-8");

				if (createBlobPayloadPending === undefined) {
					// Legacy: uploadBlob awaits storage.createBlob, which hangs. Verify the
					// promise has not settled after a microtask/macrotask flush — the contract
					// here is "no rejection, no container close", not "blob is usable".
					let settled: "resolved" | "rejected" | undefined;
					frozenFluidObject.runtime.uploadBlob(newBlob).then(
						() => (settled = "resolved"),
						() => (settled = "rejected"),
					);
					await new Promise<void>((resolve) => setTimeout(resolve, 25));
					assert.strictEqual(
						settled,
						undefined,
						"Expected legacy uploadBlob on writable-frozen to hang (no resolution/rejection)",
					);
					assert.strictEqual(
						frozenContainer.closed,
						false,
						"Expected writable frozen container to remain open during a hanging upload",
					);
					return;
				}

				// Pending-payload: uploadBlob returns a handle synchronously. The blob is locally
				// readable from the runtime's localBlobCache; the storage upload kicked off by
				// attachGraph hangs against FrozenDocumentStorageService, so the blob stays
				// `uploading` and is captured by getPendingBlobs as `localOnly`.
				const handle = (await frozenFluidObject.runtime.uploadBlob(
					newBlob,
				)) as ILocalFluidHandle<ArrayBufferLike>;
				assert.strictEqual(
					bufferToString(await handle.get(), "utf-8"),
					blobContents,
					"Expected handle.get() to return the local copy of the blob",
				);

				// Attach the handle so attachGraph runs and the blob is recorded as pending.
				frozenFluidObject.root.set("frozenBlob", handle);

				const layeredPending = await frozenContainer.getPendingLocalState();
				assert.notStrictEqual(
					layeredPending,
					pendingLocalState,
					"Expected pending state to capture the newly-added blob",
				);

				// Load a live (non-frozen) container with the layered pending state. The
				// BlobManager will call sharePendingBlobs on the real storage and complete the
				// upload — proving the blob really did accrue across the frozen boundary.
				const liveContainer = await loadExistingContainer({
					...loaderProps,
					request: { url },
					pendingLocalState: layeredPending,
				});
				const liveEntryPoint: FluidObject<TestFluidObject> =
					await liveContainer.getEntryPoint();
				assert(liveEntryPoint.ITestFluidObject !== undefined);

				const liveHandle = liveEntryPoint.ITestFluidObject.root.get(
					"frozenBlob",
				) as ILocalFluidHandle<ArrayBufferLike>;
				assert(liveHandle !== undefined, "Expected live container to see the blob handle");
				assert.strictEqual(
					bufferToString(await liveHandle.get(), "utf-8"),
					blobContents,
					"Expected live container to read the previously-frozen blob",
				);

				assert.strictEqual(
					frozenContainer.closed,
					false,
					"Expected writable frozen container to remain open after handing the blob off",
				);
			});
		});
	}
});
