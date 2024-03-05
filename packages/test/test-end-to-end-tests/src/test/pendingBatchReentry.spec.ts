/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { ISharedMap, SharedDirectory } from "@fluidframework/map";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
} from "@fluidframework/test-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import type { SharedString } from "@fluidframework/sequence";
import { IContainer } from "@fluidframework/container-definitions";
import { FlushMode } from "@fluidframework/runtime-definitions";
import type { SharedCell } from "@fluidframework/cell";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import type { SharedCounter } from "@fluidframework/counter";
import type { SharedMatrix } from "@fluidframework/matrix";

describeCompat(
	"Op reentry and rebasing during pending batches",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const {
			SharedMap,
			SharedDirectory,
			SharedMatrix,
			SharedCounter,
			SharedString,
			SharedCell,
		} = apis.dds;
		const registry: ChannelFactoryRegistry = [
			["map", SharedMap.getFactory()],
			["sharedString", SharedString.getFactory()],
			["sharedDirectory", SharedDirectory.getFactory()],
			["sharedCell", SharedCell.getFactory()],
			["sharedCounter", SharedCounter.getFactory()],
			["sharedMatrix", SharedMatrix.getFactory()],
		];
		const testContainerConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry,
		};
		let provider: ITestObjectProvider;
		let container: IContainer;
		let dataObject: ITestFluidObject;
		let sharedMap: ISharedMap;
		let sharedString: SharedString;
		let sharedDirectory: SharedDirectory;
		let sharedCell: SharedCell;
		let sharedCounter: SharedCounter;
		let sharedMatrix: SharedMatrix;

		beforeEach("getTestObjectProvider", async () => {
			provider = getTestObjectProvider();
		});

		const setupContainers = async () => {
			const configWithFeatureGates = {
				...testContainerConfig,
				runtimeOptions: { enableGroupedBatching: true, flushMode: FlushMode.Immediate },
			};
			container = await provider.makeTestContainer(configWithFeatureGates);
			dataObject = (await container.getEntryPoint()) as ITestFluidObject;
			sharedMap = await dataObject.getSharedObject<ISharedMap>("map");
			sharedString = await dataObject.getSharedObject<SharedString>("sharedString");
			sharedDirectory = await dataObject.getSharedObject<SharedDirectory>("sharedDirectory");
			sharedCell = await dataObject.getSharedObject<SharedCell>("sharedCell");
			sharedCounter = await dataObject.getSharedObject<SharedCounter>("sharedCounter");
			sharedMatrix = await dataObject.getSharedObject<SharedMatrix>("sharedMatrix");

			await provider.ensureSynchronized();
		};

		[
			{
				name: "SharedDirectory",
				initial: () => {
					sharedDirectory.set("key", true);
				},
				reentrant: () => {
					sharedDirectory.set("key", false);
				},
				assertion: () => {
					assert.strictEqual(sharedDirectory.get("key"), false);
				},
			},
			{
				name: "SharedMap",
				initial: () => {
					sharedMap.set("key", true);
				},
				reentrant: () => {
					sharedMap.set("key", false);
				},
				assertion: () => {
					assert.strictEqual(sharedMap.get("key"), false);
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
		].forEach((test) => {
			/**
			 * The test exercises a less frequent but possibly problematic scenario with grouped batching and rebasing,
			 * in which:
			 * - the container is in read mode
			 * - a batch with ops changing a DDS is created
			 * - another batch is created and because it has reentrant ops, it gets rebased
			 * - the container connects to write mode due to its pending changes
			 * - the batches inside the PendingStateManager are resubmitted
			 * - the DDS must be able to receive the ops, reconcile its internal state  and reconstruct the
			 * original changes from both batches in the expected order
			 */
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
	},
);
