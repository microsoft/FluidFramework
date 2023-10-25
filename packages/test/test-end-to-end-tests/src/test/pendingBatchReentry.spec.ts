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
import { SharedCounter } from "@fluidframework/counter";
import { SharedMatrix } from "@fluidframework/matrix";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";

describeNoCompat("Op reentry and rebasing during pending batches", (getTestObjectProvider) => {
	const mapId = "mapKey";
	const sharedStringId = "sharedStringKey";
	const sharedDirectoryId = "sharedDirectoryKey";
	const sharedCellId = "sharedCellKey";
	const sharedCounterId = "sharedCounterKey";
	const sharedMatrixId = "sharedMatrixKey";
	const consensusRegisterCollectionId = "consensusRegisterCollectionKey";

	const registry: ChannelFactoryRegistry = [
		[mapId, SharedMap.getFactory()],
		[sharedStringId, SharedString.getFactory()],
		[sharedDirectoryId, SharedDirectory.getFactory()],
		[sharedCellId, SharedCell.getFactory()],
		[sharedCounterId, SharedCounter.getFactory()],
		[sharedMatrixId, SharedMatrix.getFactory()],
		[consensusRegisterCollectionId, ConsensusRegisterCollection.getFactory()],
	];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};
	let provider: ITestObjectProvider;
	let container: IContainer;
	let dataObject: ITestFluidObject;
	let sharedMap: SharedMap;
	let sharedString: SharedString;
	let sharedDirectory: SharedDirectory;
	let sharedCell: SharedCell;
	let sharedCounter: SharedCounter;
	let sharedMatrix: SharedMatrix;

	beforeEach(async () => {
		provider = getTestObjectProvider();
	});

	const setupContainers = async () => {
		const configWithFeatureGates = {
			...testContainerConfig,
			runtimeOptions: { enableGroupedBatching: true, flushMode: FlushMode.Immediate },
		};
		container = await provider.makeTestContainer(configWithFeatureGates);
		dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
		sharedMap = await dataObject.getSharedObject<SharedMap>(mapId);
		sharedString = await dataObject.getSharedObject<SharedString>(sharedStringId);
		sharedDirectory = await dataObject.getSharedObject<SharedDirectory>(sharedDirectoryId);
		sharedCell = await dataObject.getSharedObject<SharedCell>(sharedCellId);
		sharedCounter = await dataObject.getSharedObject<SharedCounter>(sharedCounterId);
		sharedMatrix = await dataObject.getSharedObject<SharedMatrix>(sharedMatrixId);

		await provider.ensureSynchronized();
	};

	const key = "testKey";
	interface PartialBatchTest {
		name: string;
		initial: () => void;
		reentrant: () => void;
		assertion: () => void;
	}

	const tests: PartialBatchTest[] = [
		{
			name: "SharedDirectory",
			initial: () => {
				sharedDirectory.set(key, true);
			},
			reentrant: () => {
				sharedDirectory.set(key, false);
			},
			assertion: () => {
				assert.strictEqual(sharedDirectory.get(key), false);
			},
		},
		{
			name: "SharedMap",
			initial: () => {
				sharedMap.set(key, true);
			},
			reentrant: () => {
				// ADO:6050. The call below would cause assert 0x2fa
				// sharedMap.set(key, false);
			},
			assertion: () => {
				assert.strictEqual(sharedMap.get(key), true);
			},
		},
		{
			name: "SharedString",
			initial: () => {
				sharedString.insertText(0, "b");
			},
			reentrant: () => {
				sharedString.insertText(0, "a");
			},
			assertion: () => {
				assert.strictEqual(sharedString.getText(), "ab");
			},
		},
		{
			name: "SharedCell",
			initial: () => {
				sharedCell.set("a");
			},
			reentrant: () => {
				sharedCell.set("b");
			},
			assertion: () => {
				assert.strictEqual(sharedCell.get(), "b");
			},
		},
		{
			name: "SharedCounter",
			initial: () => {
				sharedCounter.increment(1);
			},
			reentrant: () => {
				sharedCounter.increment(1);
			},
			assertion: () => {
				assert.strictEqual(sharedCounter.value, 2);
			},
		},
		{
			name: "SharedMatrix",
			initial: () => {
				sharedMatrix.insertRows(0, 1);
				sharedMatrix.insertCols(0, 1);
				sharedMatrix.setCell(0, 0, 1);
			},
			reentrant: () => {
				sharedMatrix.setCell(0, 0, 2);
			},
			assertion: () => {
				assert.strictEqual(sharedMatrix.getCell(0, 0), 2);
			},
		},
	];

	tests.forEach((test) => {
		it(`Pending batches with reentry - ${test.name}`, async function () {
			await setupContainers();
			const containerRuntime = dataObject.context.containerRuntime as ContainerRuntime;

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
