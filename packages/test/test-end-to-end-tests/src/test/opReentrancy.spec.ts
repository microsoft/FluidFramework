/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
} from "@fluidframework/test-utils";
import { describeNoCompat, itExpects } from "@fluid-internal/test-version-utils";
import { SharedString } from "@fluidframework/sequence";
import { IContainer } from "@fluidframework/container-definitions";
import { IMergeTreeInsertMsg } from "@fluidframework/merge-tree";
import { FlushMode } from "@fluidframework/runtime-definitions";

describeNoCompat("Concurrent op processing via DDS event handlers", (getTestObjectProvider) => {
	const mapId = "mapKey";
	const sharedStringId = "sharedStringKey";
	const registry: ChannelFactoryRegistry = [
		[mapId, SharedMap.getFactory()],
		[sharedStringId, SharedString.getFactory()],
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

	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => settings[name],
	});

	const mapsAreEqual = (a: SharedMap, b: SharedMap) =>
		a.size === b.size && [...a.entries()].every(([key, value]) => b.get(key) === value);

	beforeEach(async () => {
		provider = getTestObjectProvider();
	});

	const setupContainers = async (
		containerConfig: ITestContainerConfig,
		featureGates: Record<string, ConfigTypes> = {},
	) => {
		const configWithFeatureGates = {
			// AB#3986 track work to removing this exception using simulateReadConnectionUsingDelay
			simulateReadConnectionUsingDelay: false,
			...containerConfig,
			loaderProps: { configProvider: configProvider(featureGates) },
		};
		container1 = await provider.makeTestContainer(configWithFeatureGates);
		container2 = await provider.loadTestContainer(configWithFeatureGates);

		dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
		dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");

		sharedMap1 = await dataObject1.getSharedObject<SharedMap>(mapId);
		sharedMap2 = await dataObject2.getSharedObject<SharedMap>(mapId);

		sharedString1 = await dataObject1.getSharedObject<SharedString>(sharedStringId);
		sharedString2 = await dataObject2.getSharedObject<SharedString>(sharedStringId);

		await provider.ensureSynchronized();
	};

	itExpects(
		"Should close the container when submitting an op while processing a batch",
		[
			{
				eventName: "fluid:telemetry:Container:ContainerClose",
				error: "Op was submitted from within a `ensureNoDataModelChanges` callback",
			},
		],
		async () => {
			await setupContainers({
				...testContainerConfig,
				runtimeOptions: {
					enableOpReentryCheck: true,
				},
			});

			sharedMap1.on("valueChanged", (changed) => {
				if (changed.key !== "key2") {
					sharedMap1.set("key2", `${sharedMap1.get("key1")} updated`);
				}
			});

			assert.throws(() => {
				sharedMap1.set("key1", "1");
			});

			sharedMap2.set("key2", "2");
			await provider.ensureSynchronized();

			// The offending container is closed
			assert.ok(container1.closed);

			// The other container is fine
			assert.equal(sharedMap2.get("key1"), undefined);
			assert.equal(sharedMap2.get("key2"), "2");
			assert.ok(!mapsAreEqual(sharedMap1, sharedMap2));
		},
	);

	[false, true].forEach((enableGroupedBatching) => {
		// ADO:4537 Enable only after rebasing is supported by the DDS
		it.skip(`Eventual consistency with op reentry - ${
			enableGroupedBatching ? "Grouped" : "Regular"
		} batches`, async () => {
			await setupContainers({
				...testContainerConfig,
				runtimeOptions: {
					enableGroupedBatching,
					enableBatchRebasing: true,
				},
			});

			sharedString1.insertText(0, "ad");
			sharedString1.insertText(1, "c");
			await provider.ensureSynchronized();

			sharedString2.on("sequenceDelta", (sequenceDeltaEvent) => {
				if ((sequenceDeltaEvent.opArgs.op as IMergeTreeInsertMsg).seg === "b") {
					sharedString2.insertText(3, "x");
				}
			});
			sharedMap2.on("valueChanged", (changed1) => {
				if (changed1.key !== "key2" && changed1.key !== "key3") {
					sharedMap2.on("valueChanged", (changed2) => {
						if (changed2.key !== "key3") {
							sharedMap2.set("key3", `${sharedMap1.get("key1")} updated`);
						}
					});

					sharedMap2.set("key2", "3");
				}
			});

			sharedMap1.set("key1", "1");

			sharedString1.insertText(1, "b");
			sharedString2.insertText(0, "y");
			await provider.ensureSynchronized();

			// The offending container is still alive
			sharedString2.insertText(0, "z");
			await provider.ensureSynchronized();

			assert.strictEqual(sharedString1.getText(), "zyabxcd");
			assert.strictEqual(
				sharedString1.getText(),
				sharedString2.getText(),
				"SharedString eventual consistency broken",
			);

			assert.strictEqual(sharedMap1.get("key1"), "1");
			assert.strictEqual(sharedMap1.get("key2"), "3");
			assert.strictEqual(sharedMap1.get("key3"), "1 updated");
			assert.ok(
				mapsAreEqual(sharedMap1, sharedMap2),
				"SharedMap eventual consistency broken",
			);

			// Both containers are alive at the end
			assert.ok(!container1.closed, "Local container is closed");
			assert.ok(!container2.closed, "Remote container is closed");
		});
	});

	it("Eventual consistency broken with op reentry, grouped batches and batch rebasing disabled", async () => {
		await setupContainers(
			{
				...testContainerConfig,
				runtimeOptions: {
					enableGroupedBatching: true,
					enableBatchRebasing: true,
				},
			},
			{ "Fluid.ContainerRuntime.DisableBatchRebasing": true },
		);

		sharedString1.insertText(0, "ad");
		await provider.ensureSynchronized();

		sharedString2.on("sequenceDelta", (sequenceDeltaEvent) => {
			if ((sequenceDeltaEvent.opArgs.op as IMergeTreeInsertMsg).seg === "b") {
				sharedString2.insertText(3, "x");
			}
		});

		sharedString1.insertText(1, "b");
		sharedString1.insertText(2, "c");
		await provider.ensureSynchronized();

		assert.notStrictEqual(
			sharedString1.getText(),
			sharedString2.getText(),
			"Unexpected eventual consistency",
		);
	});

	describe("Reentry safeguards", () => {
		itExpects(
			"Flushing is not supported",
			[
				{
					eventName: "fluid:telemetry:Container:ContainerClose",
					error: "Flushing is not supported inside DDS event handlers",
				},
			],
			async () => {
				await setupContainers({
					...testContainerConfig,
					runtimeOptions: {
						flushMode: FlushMode.Immediate,
					},
				});

				sharedString1.on("sequenceDelta", () =>
					assert.throws(() =>
						dataObject1.context.containerRuntime.orderSequentially(() =>
							sharedMap1.set("0", 0),
						),
					),
				);

				sharedString1.insertText(0, "ad");
				await provider.ensureSynchronized();
			},
		);

		it("Flushing is supported if it happens in the next batch", async () => {
			await setupContainers({
				...testContainerConfig,
				runtimeOptions: {
					flushMode: FlushMode.Immediate,
				},
			});

			sharedString1.on("sequenceDelta", (sequenceDeltaEvent) => {
				if ((sequenceDeltaEvent.opArgs.op as IMergeTreeInsertMsg).seg === "ad") {
					void Promise.resolve().then(() => {
						sharedString1.insertText(0, "bc");
					});
				}
			});

			sharedString1.insertText(0, "ad");
			await provider.ensureSynchronized();
			assert.strictEqual(sharedString1.getText(), "bcad");
		});
	});

	it("Should throw when submitting an op while handling an event - offline", async () => {
		await setupContainers({
			...testContainerConfig,
			runtimeOptions: {
				enableOpReentryCheck: true,
			},
		});

		await container1.deltaManager.inbound.pause();
		await container1.deltaManager.outbound.pause();

		sharedMap1.on("valueChanged", (changed) => {
			if (changed.key !== "key2") {
				sharedMap1.set("key2", `${sharedMap1.get("key1")} updated`);
			}
		});

		assert.throws(() => {
			sharedMap1.set("key1", "1");
		});

		container1.deltaManager.inbound.resume();
		container1.deltaManager.outbound.resume();

		await provider.ensureSynchronized();

		// The offending container is not closed
		assert.ok(!container1.closed);
		assert.ok(!mapsAreEqual(sharedMap1, sharedMap2));
	});

	describe("Allow reentry", () =>
		[
			{
				options: testContainerConfig,
				featureGates: {},
				name: "Default config and feature gates",
			},
			{
				options: {
					...testContainerConfig,
					runtimeOptions: {
						enableOpReentryCheck: true,
					},
				},
				featureGates: { "Fluid.ContainerRuntime.DisableOpReentryCheck": true },
				name: "Enabled by options, disabled by feature gate",
			},
		].forEach((testConfig) => {
			it(`Should not close the container when submitting an op while processing a batch [${testConfig.name}]`, async () => {
				await setupContainers(testConfig.options, testConfig.featureGates);

				sharedMap1.on("valueChanged", (changed) => {
					if (changed.key !== "key2") {
						sharedMap1.set("key2", `${sharedMap1.get("key1")} updated`);
					}
				});

				const outOfOrderObservations: string[] = [];
				sharedMap1.on("valueChanged", (changed) => {
					outOfOrderObservations.push(changed.key);
				});

				sharedMap1.set("key1", "1");
				sharedMap2.set("key2", "2");
				await provider.ensureSynchronized();

				// The offending container is not closed
				assert.ok(!container1.closed);
				assert.equal(sharedMap1.get("key2"), "1 updated");

				// The other container is also fine
				assert.equal(sharedMap2.get("key1"), "1");
				assert.equal(sharedMap2.get("key2"), "1 updated");

				// The second event handler didn't receive the events in the actual order of changes
				assert.deepEqual(outOfOrderObservations, ["key2", "key1"]);
				assert.ok(mapsAreEqual(sharedMap1, sharedMap2));
			});

			it(`Should not throw when submitting an op while processing a batch - offline [${testConfig.name}]`, async () => {
				await setupContainers(
					{
						...testContainerConfig,
						runtimeOptions: {
							enableOpReentryCheck: true,
						},
					},
					{ "Fluid.ContainerRuntime.DisableOpReentryCheck": true },
				);

				await container1.deltaManager.inbound.pause();
				await container1.deltaManager.outbound.pause();

				sharedMap1.on("valueChanged", (changed) => {
					if (changed.key !== "key2") {
						sharedMap1.set("key2", `${sharedMap1.get("key1")} updated`);
					}
				});

				const outOfOrderObservations: string[] = [];
				sharedMap1.on("valueChanged", (changed) => {
					outOfOrderObservations.push(changed.key);
				});

				sharedMap1.set("key1", "1");

				container1.deltaManager.inbound.resume();
				container1.deltaManager.outbound.resume();
				await provider.ensureSynchronized();

				// The offending container is not closed
				assert.ok(!container1.closed);

				// The second event handler didn't receive the events in the actual order of changes
				assert.deepEqual(outOfOrderObservations, ["key2", "key1"]);
				assert.ok(mapsAreEqual(sharedMap1, sharedMap2));
			});
		}));
});
