/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { SharedMap } from "@fluidframework/map";
import { IDocumentMessage } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { Deferred } from "@fluidframework/common-utils";

describeNoCompat("Message size", (getTestObjectProvider) => {
	const mapId = "mapId";
	const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	let provider: ITestObjectProvider;
	const capturedBatches: IDocumentMessage[][] = [];

	beforeEach(() => {
		provider = getTestObjectProvider();
		capturedBatches.splice(0);
	});
	afterEach(async () => provider.reset());

	let localContainer: IContainer;
	let remoteContainer: IContainer;
	let dataObject1: ITestFluidObject;
	let dataObject2: ITestFluidObject;
	let dataObject1map: SharedMap;
	let dataObject2map: SharedMap;

	const setupContainers = async (containerConfig: ITestContainerConfig) => {
		// Create a Container for the first client.
		localContainer = await provider.makeTestContainer(containerConfig);
		dataObject1 = await requestFluidObject<ITestFluidObject>(localContainer, "default");
		dataObject1map = await dataObject1.getSharedObject<SharedMap>(mapId);

		// Load the Container that was created by the first client.
		remoteContainer = await provider.loadTestContainer(containerConfig);
		dataObject2 = await requestFluidObject<ITestFluidObject>(remoteContainer, "default");
		dataObject2map = await dataObject2.getSharedObject<SharedMap>(mapId);
		await waitForContainerConnection(localContainer, true);
		await waitForContainerConnection(remoteContainer, true);

		localContainer.deltaManager.outbound.on("op", (batch: IDocumentMessage[]) => {
			capturedBatches.push(batch);
		});
		await provider.ensureSynchronized();
	};

	it("Ops from within `orderSequentially` with flushing will be in the same batch", async () => {
		await setupContainers(testContainerConfig);

		// Force the container into write-mode before testing `orderSequentially`
		dataObject1map.set("key0", "0");
		await provider.ensureSynchronized();

		// Ignore the batch we just sent
		capturedBatches.splice(0);

		const runtime = dataObject1.context.containerRuntime as ContainerRuntime;
		const count = 5;
		const flush = new Deferred<void>();
		runtime.orderSequentially(() => {
			dataObject1map.set("key1", "1");
			const promises = [
				Promise.resolve()
					.then(async () => {
						dataObject1map.set("key2", "2");
					})
					.catch((error) => console.error(error)),
				Promise.resolve().then(async () => {
					dataObject1map.set("key3", "3");
				}),
				void Promise.resolve().then(async () => {
					dataObject1map.set("key4", "4");
					await Promise.resolve().then(async () => {
						dataObject1map.set("key5", "5");
					});
				}),
			];

			void Promise.all(promises).then(() => flush.resolve());
		}, flush);

		await provider.ensureSynchronized();

		assert.strictEqual(capturedBatches.length, 1);
		assert.strictEqual(capturedBatches[0].length, 5);

		for (let i = 1; i <= count; i++) {
			const value = dataObject2map.get(`key${i}`);
			assert.strictEqual(value, `${i}`, `Wrong value for key${i}`);
		}
	});

	it("Ops from within `orderSequentially` without flushing will not be in the same batch", async () => {
		await setupContainers(testContainerConfig);

		// Force the container into write-mode before testing `orderSequentially`
		dataObject1map.set("key0", "0");
		await provider.ensureSynchronized();

		// Ignore the batch we just sent
		capturedBatches.splice(0);

		const runtime = dataObject1.context.containerRuntime as ContainerRuntime;
		const count = 5;
		runtime.orderSequentially(() => {
			dataObject1map.set("key1", "1");

			void Promise.resolve().then(async () => {
				dataObject1map.set("key2", "2");
			});
			void Promise.resolve().then(async () => {
				dataObject1map.set("key3", "3");
			});
			void Promise.resolve().then(async () => {
				dataObject1map.set("key4", "4");
				await Promise.resolve().then(async () => {
					dataObject1map.set("key5", "5");
				});
			});
		});

		await provider.ensureSynchronized();
		assert.strictEqual(capturedBatches.length, 3);

		for (let i = 1; i <= count; i++) {
			const value = dataObject2map.get(`key${i}`);
			assert.strictEqual(value, `${i}`, `Wrong value for key${i}`);
		}
	});
});
