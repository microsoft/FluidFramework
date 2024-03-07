/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IContainer, IHostLoader } from "@fluidframework/container-definitions";
import type { ISharedMap } from "@fluidframework/map";
import {
	ChannelFactoryRegistry,
	createAndAttachContainer,
	ITestFluidObject,
	ITestContainerConfig,
	ITestObjectProvider,
	DataObjectFactoryType,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainerExperimental } from "@fluidframework/container-loader";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

const mapId = "map";

const lots = 30;
const testValue = "test value";

type MapCallback = (
	container: IContainer,
	dataStore: ITestFluidObject,
	map: ISharedMap,
) => void | Promise<void>;

describeCompat("Container dirty flag", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap } = apis.dds;
	const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
		loaderProps: {
			configProvider: configProvider({
				"Fluid.Container.enableOfflineLoad": true,
			}),
		},
	};

	// load container, pause, create (local) ops from callback, then optionally send ops before closing container
	const getPendingOps = async (args: ITestObjectProvider, send: boolean, cb: MapCallback) => {
		const container: IContainerExperimental = await args.loadTestContainer(testContainerConfig);
		await waitForContainerConnection(container);
		const dataStore = (await container.getEntryPoint()) as ITestFluidObject;
		const map = await dataStore.getSharedObject<ISharedMap>(mapId);

		[...Array(lots).keys()].map((i) =>
			dataStore.root.set(`make sure csn is > 1 so it doesn't hide bugs ${i}`, i),
		);

		await args.ensureSynchronized();
		await args.opProcessingController.pauseProcessing(container);
		assert(dataStore.runtime.deltaManager.outbound.paused);

		await cb(container, dataStore, map);

		let pendingState: string | undefined;
		if (send) {
			pendingState = await container.getPendingLocalState?.();
			assert.strictEqual(container.closed, false);
			await args.ensureSynchronized();
			container.close();
		} else {
			pendingState = await container.closeAndGetPendingLocalState?.();
		}

		args.opProcessingController.resumeProcessing();

		assert.ok(pendingState);
		return pendingState;
	};

	let provider: ITestObjectProvider;
	let url;
	let loader: IHostLoader;
	let container1: IContainer;
	let map1: ISharedMap;

	describe("Attached container", () => {
		const verifyDirtyStateTransitions = async (container: IContainer) => {
			assert.strictEqual(container.isDirty, false, "Container should not be dirty");

			const dataStore2 = (await container.getEntryPoint()) as ITestFluidObject;
			const map2 = await dataStore2.getSharedObject<ISharedMap>(mapId);
			map2.set("key", "value");

			assert.strictEqual(container.isDirty, true, "Container should be dirty");

			// Wait for the ops to get processed which should mark the document clean after processing
			await provider.ensureSynchronized();
			assert.strictEqual(
				container.isDirty,
				false,
				"Container should not be dirty, after sync",
			);
		};

		beforeEach("setup", async () => {
			provider = getTestObjectProvider();
			loader = provider.makeTestLoader(testContainerConfig);
			container1 = await createAndAttachContainer(
				provider.defaultCodeDetails,
				loader,
				provider.driver.createCreateNewRequest(provider.documentId),
			);
			provider.updateDocumentId(container1.resolvedUrl);
			url = await container1.getAbsoluteUrl("");
			const dataStore1 = (await container1.getEntryPoint()) as ITestFluidObject;
			map1 = await dataStore1.getSharedObject<ISharedMap>(mapId);
		});

		it("handles container with pending ops to be sent out", async function () {
			const pendingOps = await getPendingOps(provider, false, (c, d, map) => {
				[...Array(lots).keys()].map((i) => map.set(i.toString(), i));
			});

			// load container with pending ops, which should resend the ops not sent by previous container
			const container2 = await loader.resolve({ url }, pendingOps);
			await waitForContainerConnection(container2);
			await provider.ensureSynchronized();

			await verifyDirtyStateTransitions(container2);
		});

		it("handles container with pending ops not to be sent out", async function () {
			const pendingOps = await getPendingOps(provider, true, (c, d, map) => {
				[...Array(lots).keys()].map((i) => map.set(i.toString(), i));
			});

			// send a bunch from first container that should not be overwritten
			[...Array(lots).keys()].map((i) => map1.set(i.toString(), testValue));
			await provider.ensureSynchronized();

			// load container with pending ops, which should not resend the ops sent by previous container
			const container2 = await loader.resolve({ url }, pendingOps);
			await waitForContainerConnection(container2);
			await provider.ensureSynchronized();

			await verifyDirtyStateTransitions(container2);
		});

		it("handles container with no pending ops", async function () {
			// load container with no pending ops
			const container2 = await loader.resolve({ url });
			await provider.ensureSynchronized();

			await verifyDirtyStateTransitions(container2);
		});

		it("handles container that had no requests to process", async function () {
			const container = await createAndAttachContainer(
				provider.defaultCodeDetails,
				loader,
				provider.driver.createCreateNewRequest(provider.documentId),
			);

			assert.strictEqual(container.isDirty, false, "Container should not be dirty");
			await provider.ensureSynchronized();
		});
	});
});
