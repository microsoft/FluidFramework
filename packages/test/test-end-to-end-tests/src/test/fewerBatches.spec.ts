/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
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
import { FlushMode, FlushModeExperimental } from "@fluidframework/runtime-definitions";

describeNoCompat("Less batches", (getTestObjectProvider) => {
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

	[
		{
			flushMode: FlushMode.TurnBased,
			batchCount: 5,
		},
		{
			flushMode: FlushMode.Immediate,
			batchCount: 5,
		},
		{
			flushMode: FlushModeExperimental.Async as unknown as FlushMode,
			batchCount: 1,
		},
	].forEach((test) => {
		it(`With runtime flushMode=FlushMode.${
			FlushMode[test.flushMode]
		}, ops across JS turns produce ${test.batchCount} batches`, async () => {
			await setupContainers({
				...testContainerConfig,
				runtimeOptions: {
					flushMode: test.flushMode,
				},
			});

			// Force the container into write-mode
			dataObject1map.set("key0", "0");
			await provider.ensureSynchronized();

			// Ignore the batch we just sent
			capturedBatches.splice(0);

			const opCount = 5;
			dataObject1map.set("key1", "1");

			await Promise.resolve().then(async () => {
				dataObject1map.set("key2", "2");
			});
			await Promise.resolve().then(async () => {
				dataObject1map.set("key3", "3");
			});
			await Promise.resolve().then(async () => {
				dataObject1map.set("key4", "4");
				await Promise.resolve().then(async () => {
					dataObject1map.set("key5", "5");
				});
			});

			await provider.ensureSynchronized();

			assert.strictEqual(capturedBatches.length, test.batchCount);

			for (let i = 1; i <= opCount; i++) {
				const value = dataObject2map.get(`key${i}`);
				assert.strictEqual(value, `${i}`, `Wrong value for key${i}`);
			}
		});
	});
});
