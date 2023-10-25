/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import { SharedString } from "@fluidframework/sequence";
import { IContainer } from "@fluidframework/container-definitions";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { SharedCell } from "@fluidframework/cell";
import { ContainerRuntime } from "@fluidframework/container-runtime";

describeNoCompat("Op reentry and rebasing during pending batches", (getTestObjectProvider) => {
	const mapId = "mapKey";
	const sharedStringId = "sharedStringKey";
	const sharedDirectoryId = "sharedDirectoryKey";
	const sharedCellId = "sharedCellKey";

	const registry: ChannelFactoryRegistry = [
		[mapId, SharedMap.getFactory()],
		[sharedStringId, SharedString.getFactory()],
		[sharedDirectoryId, SharedDirectory.getFactory()],
		[sharedCellId, SharedCell.getFactory()],
	];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};
	let provider: ITestObjectProvider;
	let container1: IContainer;
	let container2: IContainer;
	let dataObject1: ITestFluidObject;
	let dataObject2: ITestFluidObject;
	let sharedMap1: SharedMap;
	let sharedMap2: SharedMap;
	let sharedString1: SharedString;
	let sharedString2: SharedString;
	let sharedDirectory1: SharedDirectory;
	let sharedDirectory2: SharedDirectory;
	let sharedCell1: SharedCell;
	let sharedCell2: SharedCell;

	beforeEach(async () => {
		provider = getTestObjectProvider();
	});

	const setupContainers = async () => {
		const configWithFeatureGates = {
			...testContainerConfig,
			runtimeOptions: { enableGroupedBatching: true, flushMode: FlushMode.Immediate },
		};
		container1 = await provider.makeTestContainer(configWithFeatureGates);
		container2 = await provider.loadTestContainer(configWithFeatureGates);

		dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
		dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");

		sharedMap1 = await dataObject1.getSharedObject<SharedMap>(mapId);
		sharedMap2 = await dataObject2.getSharedObject<SharedMap>(mapId);

		sharedString1 = await dataObject1.getSharedObject<SharedString>(sharedStringId);
		sharedString2 = await dataObject2.getSharedObject<SharedString>(sharedStringId);

		sharedDirectory1 = await dataObject1.getSharedObject<SharedDirectory>(sharedDirectoryId);
		sharedDirectory2 = await dataObject2.getSharedObject<SharedDirectory>(sharedDirectoryId);

		sharedCell1 = await dataObject1.getSharedObject<SharedCell>(sharedCellId);
		sharedCell2 = await dataObject2.getSharedObject<SharedCell>(sharedCellId);

		await provider.ensureSynchronized();
	};

	const key = "testKey";
	interface PartialBatchTest {
		name: string;
		initial: () => void;
		reentrant: () => void;
		assertion: () => void;
	}

	const tests: PartialBatchTest[] = [];
	tests.push({
		name: "SharedDirectory",
		initial: () => {
			sharedDirectory1.set(key, true);
		},
		reentrant: () => {
			sharedDirectory1.set(key, false);
		},
		assertion: () => {
			assert.strictEqual(sharedDirectory1.get(key), false);
			assert.strictEqual(sharedDirectory2.get(key), false);
		},
	});

	tests.forEach((test) => {
		it(`Pending batches with reentry - ${test.name}`, async function () {
			await setupContainers();
			const containerRuntime = dataObject1.context.containerRuntime as ContainerRuntime;

			test.initial();
			containerRuntime.orderSequentially(() => {
				containerRuntime.ensureNoDataModelChanges(() => {
					test.reentrant();
				});
			});

			await provider.ensureSynchronized();
			test.assertion();
		});
	});
});
