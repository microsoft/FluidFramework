/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import type { SharedDirectory, ISharedMap } from "@fluidframework/map/internal";
import { IMergeTreeInsertMsg } from "@fluidframework/merge-tree/internal";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import type { SharedString } from "@fluidframework/sequence/internal";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	toIDeltaManagerFull,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils/internal";

describeCompat(
	"Concurrent op processing via DDS event handlers",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { SharedMap, SharedDirectory, SharedString } = apis.dds;
		const mapId = "mapKey";
		const sharedStringId = "sharedStringKey";
		const sharedDirectoryId = "sharedDirectoryKey";
		const registry: ChannelFactoryRegistry = [
			[mapId, SharedMap.getFactory()],
			[sharedStringId, SharedString.getFactory()],
			[sharedDirectoryId, SharedDirectory.getFactory()],
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
		let sharedMap1: ISharedMap;
		let sharedMap2: ISharedMap;
		let sharedString1: SharedString;
		let sharedString2: SharedString;
		let sharedDirectory1: SharedDirectory;
		let sharedDirectory2: SharedDirectory;

		const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
			getRawConfig: (name: string): ConfigTypes => settings[name],
		});

		const mapsAreEqual = (a: ISharedMap, b: ISharedMap) =>
			a.size === b.size && [...a.entries()].every(([key, value]) => b.get(key) === value);

		beforeEach("getTestObjectProvider", async () => {
			provider = getTestObjectProvider();
		});

		const setupContainers = async (
			containerConfig: ITestContainerConfig,
			featureGates: Record<string, ConfigTypes> = {},
		) => {
			const configWithFeatureGates = {
				...containerConfig,
				loaderProps: { configProvider: configProvider(featureGates) },
			};
			provider.reset();
			container1 = await provider.makeTestContainer(configWithFeatureGates);
			container2 = await provider.loadTestContainer(configWithFeatureGates);

			dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
			dataObject2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);

			sharedMap1 = await dataObject1.getSharedObject<ISharedMap>(mapId);
			sharedMap2 = await dataObject2.getSharedObject<ISharedMap>(mapId);

			sharedString1 = await dataObject1.getSharedObject<SharedString>(sharedStringId);
			sharedString2 = await dataObject2.getSharedObject<SharedString>(sharedStringId);

			sharedDirectory1 = await dataObject1.getSharedObject<SharedDirectory>(sharedDirectoryId);
			sharedDirectory2 = await dataObject2.getSharedObject<SharedDirectory>(sharedDirectoryId);

			await provider.ensureSynchronized();
		};

		it("Test reentrant op sending", async function () {
			if (provider.driver.type === "t9s" || provider.driver.type === "tinylicious") {
				// This test is flaky on Tinylicious. ADO:5010
				this.skip();
			}

			await setupContainers(testContainerConfig);

			// ! We need to force container1 to be in "write" mode to ensure its messages are sent before container2
			// ! Saw some flakiness against r11s where container2 would sometimes reconnect faster
			sharedMap1.set("key3", "3");
			await provider.ensureSynchronized();

			sharedMap1.on("valueChanged", (changed) => {
				if (changed.key !== "key2") {
					sharedMap1.set("key2", `${sharedMap1.get("key1")} updated`);
				}
			});

			sharedMap1.set("key1", "1");
			sharedMap2.set("key2", "2");

			await provider.ensureSynchronized();

			assert.ok(!container1.closed);
			assert.ok(!container2.closed);

			// The other container is fine
			assert.equal(sharedMap2.get("key1"), "1");
			assert.equal(sharedMap2.get("key2"), "2");
			assert.equal(sharedMap2.get("key3"), "3");
			assert.ok(mapsAreEqual(sharedMap1, sharedMap2));
		});

		[false, true].forEach((enableGroupedBatching) => {
			it(`Eventual consistency with op reentry - ${
				enableGroupedBatching ? "Grouped" : "Regular"
			} batches`, async function () {
				if (provider.driver.type === "t9s" || provider.driver.type === "tinylicious") {
					// This test is flaky on Tinylicious. ADO:5010
					this.skip();
				}

				await setupContainers({
					...testContainerConfig,
					runtimeOptions: {
						enableGroupedBatching,
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

			it(`Eventual consistency for shared directories with op reentry - ${
				enableGroupedBatching ? "Grouped" : "Regular"
			} batches`, async function () {
				if (provider.driver.type === "t9s" || provider.driver.type === "tinylicious") {
					// This test is flaky on Tinylicious. ADO:5010
					this.skip();
				}

				await setupContainers({
					...testContainerConfig,
					runtimeOptions: {
						enableGroupedBatching,
					},
				});

				const concurrentValue = 10;
				const topLevel = "root";
				const innerLevel = "inner";
				const key = "key";
				sharedDirectory1
					.createSubDirectory(topLevel)
					.createSubDirectory(innerLevel)
					.set(key, concurrentValue);

				await provider.ensureSynchronized();

				const concurrentValue1 = concurrentValue + 10;
				const concurrentValue2 = concurrentValue + 20;

				sharedDirectory1
					.getSubDirectory(topLevel)
					?.getSubDirectory(innerLevel)
					?.set(key, concurrentValue1);
				sharedDirectory2
					.getSubDirectory(topLevel)
					?.getSubDirectory(innerLevel)
					?.set(key, concurrentValue2);

				await provider.ensureSynchronized();
				assert.strictEqual(
					sharedDirectory1.getSubDirectory(topLevel)?.getSubDirectory(innerLevel)?.get(key),
					sharedDirectory2.getSubDirectory(topLevel)?.getSubDirectory(innerLevel)?.get(key),
				);
			});
		});

		describe("Reentry safeguards", () => {
			it("Flushing is supported if it happens in the next batch", async function () {
				if (provider.driver.type === "t9s" || provider.driver.type === "tinylicious") {
					// This test is flaky on Tinylicious. ADO:5010
					this.skip();
				}

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

		it("Should not throw when submitting an op while handling an event - offline", async function () {
			if (provider.driver.type === "t9s" || provider.driver.type === "tinylicious") {
				// This test is flaky on Tinylicious. ADO:5010
				this.skip();
			}

			await setupContainers({
				...testContainerConfig,
				runtimeOptions: {},
			});

			const container1DeltaManager = toIDeltaManagerFull(container1.deltaManager);
			await container1DeltaManager.inbound.pause();
			await container1DeltaManager.outbound.pause();

			sharedMap1.on("valueChanged", (changed) => {
				if (changed.key !== "key2") {
					sharedMap1.set("key2", `${sharedMap1.get("key1")} updated`);
				}
			});

			sharedMap1.set("key1", "1");

			container1DeltaManager.inbound.resume();
			container1DeltaManager.outbound.resume();

			await provider.ensureSynchronized();

			// The offending container is not closed
			assert.ok(!container1.closed);
			assert.ok(mapsAreEqual(sharedMap1, sharedMap2));
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
						runtimeOptions: {},
					},
					name: "Enabled by options, disabled by feature gate",
				},
			].forEach((testConfig) => {
				it(`Should not close the container when submitting an op while processing a batch [${testConfig.name}]`, async function () {
					if (provider.driver.type === "t9s" || provider.driver.type === "tinylicious") {
						// This test is flaky on Tinylicious. ADO:5010
						this.skip();
					}

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

					sharedMap2.set("key2", "2");
					await provider.ensureSynchronized();

					sharedMap1.set("key1", "1");
					await provider.ensureSynchronized();

					// The offending container is not closed
					assert.ok(!container1.closed);
					assert.equal(sharedMap1.get("key2"), "1 updated");

					// The other container is also fine
					assert.equal(sharedMap2.get("key1"), "1");
					assert.equal(sharedMap2.get("key2"), "1 updated");

					// The second event handler didn't receive the events in the actual order of changes
					assert.deepEqual(outOfOrderObservations, ["key2", "key2", "key1"]);
					assert.ok(mapsAreEqual(sharedMap1, sharedMap2));
				});

				it(`Should not throw when submitting an op while processing a batch - offline [${testConfig.name}]`, async function () {
					if (provider.driver.type === "t9s" || provider.driver.type === "tinylicious") {
						// This test is flaky on Tinylicious. ADO:5010
						this.skip();
					}

					await setupContainers(testConfig.options, testConfig.featureGates);

					const deltaManagerFull = toIDeltaManagerFull(container1.deltaManager);
					await deltaManagerFull.inbound.pause();
					await deltaManagerFull.outbound.pause();

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

					deltaManagerFull.inbound.resume();
					deltaManagerFull.outbound.resume();
					await provider.ensureSynchronized();

					// The offending container is not closed
					assert.ok(!container1.closed);

					// The second event handler didn't receive the events in the actual order of changes
					assert.deepEqual(outOfOrderObservations, ["key2", "key1"]);
					assert.ok(mapsAreEqual(sharedMap1, sharedMap2));
				});
			}));
	},
);
