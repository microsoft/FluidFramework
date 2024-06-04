/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// eslint-disable-next-line import/no-nodejs-modules
import * as crypto from "crypto";

import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import {
	CompressionAlgorithms,
	ContainerMessageType,
} from "@fluidframework/container-runtime/internal";
import { ConfigTypes, IConfigProviderBase, IErrorBase } from "@fluidframework/core-interfaces";
import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import { IDocumentMessage, MessageType } from "@fluidframework/driver-definitions/internal";
import type { ISharedMap } from "@fluidframework/map/internal";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import { GenericError } from "@fluidframework/telemetry-utils/internal";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

describeCompat("Message size", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap } = apis.dds;
	const mapId = "mapId";
	const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});
	afterEach(async function () {
		provider.reset();
	});

	let localContainer: IContainer;
	let remoteContainer: IContainer;
	let localDataObject: ITestFluidObject;
	let remoteDataObject: ITestFluidObject;
	let localMap: ISharedMap;
	let remoteMap: ISharedMap;

	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => {
		return {
			getRawConfig: (name: string): ConfigTypes => settings[name],
		};
	};

	const setupContainers = async (
		containerConfig: ITestContainerConfig,
		featureGates: Record<string, ConfigTypes> = {},
	) => {
		const configWithFeatureGates = {
			...containerConfig,
			loaderProps: { configProvider: configProvider(featureGates) },
		};

		// Create a Container for the first client.
		localContainer = await provider.makeTestContainer(configWithFeatureGates);
		localDataObject = (await localContainer.getEntryPoint()) as ITestFluidObject;
		localMap = await localDataObject.getSharedObject<ISharedMap>(mapId);

		// Load the Container that was created by the first client.
		remoteContainer = await provider.loadTestContainer(configWithFeatureGates);
		remoteDataObject = (await remoteContainer.getEntryPoint()) as ITestFluidObject;
		remoteMap = await remoteDataObject.getSharedObject<ISharedMap>(mapId);

		await waitForContainerConnection(localContainer, true);
		await waitForContainerConnection(remoteContainer, true);

		// Force the local container into write-mode by sending a small op
		localMap.set("test", "test");
		await provider.ensureSynchronized();
	};

	const generateRandomStringOfSize = (sizeInBytes: number): string =>
		crypto.randomBytes(sizeInBytes / 2).toString("hex");
	const generateStringOfSize = (sizeInBytes: number): string =>
		new Array(sizeInBytes + 1).join("0");
	const setMapKeys = (map: ISharedMap, count: number, item: string): void => {
		for (let i = 0; i < count; i++) {
			map.set(`key${i}`, item);
		}
	};

	const assertMapValues = (map: ISharedMap, count: number, expected: string): void => {
		for (let i = 0; i < count; i++) {
			const value = map.get(`key${i}`);
			assert.strictEqual(value, expected, `Wrong value for key${i}`);
		}
	};

	const containerError = async (container: IContainer) =>
		new Promise<IErrorBase | undefined>((resolve) =>
			container.once("closed", (error) => {
				resolve(error);
			}),
		);

	const disableCompressionConfig = {
		...testContainerConfig,
		runtimeOptions: {
			compressionOptions: {
				minimumBatchSizeInBytes: Number.POSITIVE_INFINITY,
				compressionAlgorithm: CompressionAlgorithms.lz4,
			},
		},
	}; // Compression is enabled by default

	itExpects(
		"A large op will close the container when compression is disabled",
		[{ eventName: "fluid:telemetry:Container:ContainerClose", error: "BatchTooLarge" }],
		async () => {
			const maxMessageSizeInBytes = 1024 * 1024; // 1Mb
			await setupContainers(disableCompressionConfig);

			const errorEvent = containerError(localContainer);

			const largeString = generateStringOfSize(maxMessageSizeInBytes + 1);
			const messageCount = 1;
			try {
				setMapKeys(localMap, messageCount, largeString);
				assert(false, "should throw");
			} catch {}

			const error = await errorEvent;
			assert.equal(error?.errorType, FluidErrorTypes.genericError);
			assert.ok(error.getTelemetryProperties?.().opSize ?? 0 > maxMessageSizeInBytes);

			// Limit has to be around 1Mb, but we should not assume here precise number.
			const limit = error.getTelemetryProperties?.().limit as number;
			assert(limit > maxMessageSizeInBytes / 2);
			assert(limit < maxMessageSizeInBytes * 2);
		},
	);

	it("Small ops will pass", async () => {
		const totalMessageSizeInBytes = 800 * 1024; // slightly below 1Mb
		await setupContainers(testContainerConfig);
		const largeString = generateStringOfSize(totalMessageSizeInBytes / 10);
		const messageCount = 10;
		setMapKeys(localMap, messageCount, largeString);
		await provider.ensureSynchronized();

		assertMapValues(remoteMap, messageCount, largeString);
	});

	it("Small batches pass while disconnected, succeed when the container connects and compression is disabled", async function () {
		// Blocked waiting on AB#2690
		if (provider.driver.type === "local") {
			this.skip();
		}

		const maxMessageSizeInBytes = 600 * 1024;
		await setupContainers(disableCompressionConfig);
		const largeString = generateStringOfSize(maxMessageSizeInBytes / 10);
		const messageCount = 10;
		localContainer.disconnect();
		for (let i = 0; i < 3; i++) {
			setMapKeys(localMap, messageCount, largeString);
			await new Promise<void>((resolve) => setTimeout(resolve));
			// Individual small batches will pass, as the container is disconnected and
			// batches will be stored as pending
			assert.equal(localContainer.closed, false);
		}

		// On reconnect, all small batches will be sent at once
		localContainer.connect();
		await provider.ensureSynchronized();
	});

	it("Batched small ops pass when batch is larger than max op size", async function () {
		// flush mode is not applicable for the local driver
		if (provider.driver.type === "local") {
			this.skip();
		}

		await setupContainers({
			...testContainerConfig,
			runtimeOptions: { flushMode: FlushMode.Immediate },
		});
		const messageSizeInBytes = 500000;
		const largeString = generateStringOfSize(messageSizeInBytes);
		const messageCount = 10;
		setMapKeys(localMap, messageCount, largeString);
		await provider.ensureSynchronized();

		assertMapValues(remoteMap, messageCount, largeString);
	});

	it("Single large op passes when compression enabled and over max op size", async () => {
		const messageSizeInBytes = 1024 * 1024 + 1; // 1Mb
		await setupContainers({
			...testContainerConfig,
			runtimeOptions: {
				compressionOptions: {
					minimumBatchSizeInBytes: 1,
					compressionAlgorithm: CompressionAlgorithms.lz4,
				},
			},
		});

		const largeString = generateStringOfSize(messageSizeInBytes);
		const messageCount = 1;
		setMapKeys(localMap, messageCount, largeString);
	});

	it("Batched small ops pass when compression enabled and batch is larger than max op size", async function () {
		await setupContainers({
			...testContainerConfig,
			runtimeOptions: {
				compressionOptions: {
					minimumBatchSizeInBytes: 1,
					compressionAlgorithm: CompressionAlgorithms.lz4,
				},
			},
		});
		const messageSizeInBytes = 100 * 1024;
		const largeString = generateStringOfSize(messageSizeInBytes);
		const messageCount = 10;
		setMapKeys(localMap, messageCount, largeString);
		await provider.ensureSynchronized();

		assertMapValues(remoteMap, messageCount, largeString);
	});

	itExpects(
		"Large ops fail when compression is disabled and the content is over max op size",
		[{ eventName: "fluid:telemetry:Container:ContainerClose", error: "BatchTooLarge" }],
		async function () {
			const maxMessageSizeInBytes = 5 * 1024 * 1024; // 5MB
			await setupContainers(disableCompressionConfig);

			const largeString = generateRandomStringOfSize(maxMessageSizeInBytes);
			const messageCount = 3; // Will result in a 15 MB payload
			assert.throws(() => setMapKeys(localMap, messageCount, largeString));
			await provider.ensureSynchronized();
		},
	);

	itExpects(
		"Large ops fail when compression is disabled by feature gate and the content is over max op size",
		[{ eventName: "fluid:telemetry:Container:ContainerClose", error: "BatchTooLarge" }],
		async function () {
			const maxMessageSizeInBytes = 5 * 1024 * 1024; // 5MB
			await setupContainers(testContainerConfig, {
				"Fluid.ContainerRuntime.CompressionDisabled": true,
			});

			const largeString = generateStringOfSize(maxMessageSizeInBytes);
			const messageCount = 10;
			assert.throws(() => setMapKeys(localMap, messageCount, largeString));
			await provider.ensureSynchronized();
		},
	);

	itExpects(
		"Large ops fail when compression enabled and compressed content is over max op size",
		[{ eventName: "fluid:telemetry:Container:ContainerClose", error: "BatchTooLarge" }],
		async function () {
			const maxMessageSizeInBytes = 5 * 1024 * 1024; // 5MB
			await setupContainers({
				...testContainerConfig,
				runtimeOptions: {
					chunkSizeInBytes: Number.POSITIVE_INFINITY,
				},
			});

			const largeString = generateRandomStringOfSize(maxMessageSizeInBytes);
			const messageCount = 3; // Will result in a 15 MB payload
			setMapKeys(localMap, messageCount, largeString);
			await provider.ensureSynchronized();
		},
	);

	const chunkingBatchesTimeoutMs = 200000;

	[false, true].forEach((enableGroupedBatching) => {
		const compressionSizeThreshold = 1024 * 1024;
		const containerConfig: ITestContainerConfig = {
			...testContainerConfig,
			runtimeOptions: {
				summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
				enableGroupedBatching,
			},
		};

		itExpects(
			`Batch with 4000 ops - ${enableGroupedBatching ? "grouped" : "regular"} batches`,
			enableGroupedBatching
				? [] // With grouped batching enabled, this scenario is unblocked
				: [
						{
							eventName: "fluid:telemetry:Container:ContainerClose",
							error: "Runtime detected too many reconnects with no progress syncing local ops.",
						},
				  ], // Without grouped batching, it is expected for the container to never make progress
			async function () {
				await setupContainers(containerConfig);
				// This is not supported by the local server. See ADO:2690
				// This test is flaky on tinylicious. See ADO:2964
				if (provider.driver.type === "local" || provider.driver.type === "tinylicious") {
					if (!enableGroupedBatching) {
						// Workaround for the `itExpects` construct
						localContainer.close(
							new GenericError(
								"Runtime detected too many reconnects with no progress syncing local ops.",
							),
						);
					}

					this.skip();
				}

				const content = generateRandomStringOfSize(10);
				for (let i = 0; i < 4000; i++) {
					localMap.set(`key${i}`, content);
				}

				await provider.ensureSynchronized();
			},
		).timeout(chunkingBatchesTimeoutMs);

		describe(`Large payloads (exceeding the 1MB limit) - ${
			enableGroupedBatching ? "grouped" : "regular"
		} batches`, () => {
			describe("Chunking compressed batches", () =>
				[
					{ messagesInBatch: 1, messageSize: 2 * 1024 * 1024 }, // One large message
					{ messagesInBatch: 3, messageSize: 2 * 1024 * 1024 }, // Three large messages
					{ messagesInBatch: 1500, messageSize: 4 * 1024 }, // Many small messages
				].forEach((testConfig) => {
					it(
						"Large payloads pass when compression enabled, " +
							"compressed content is over max op size and chunking enabled. " +
							`${testConfig.messagesInBatch.toLocaleString()} messages of ${testConfig.messageSize.toLocaleString()} bytes == ` +
							`${(
								(testConfig.messagesInBatch * testConfig.messageSize) /
								(1024 * 1024)
							).toFixed(2)} MB`,
						async function () {
							// This is not supported by the local server. See ADO:2690
							// This test is flaky on tinylicious. See ADO:2964
							if (
								provider.driver.type === "local" ||
								provider.driver.type === "tinylicious"
							) {
								this.skip();
							}

							await setupContainers(containerConfig);

							const generated: string[] = [];
							for (let i = 0; i < testConfig.messagesInBatch; i++) {
								// Ensure that the contents don't get compressed properly, by
								// generating a random string for each map value instead of repeating it
								const content = generateRandomStringOfSize(testConfig.messageSize);
								generated.push(content);
								localMap.set(`key${i}`, content);
							}

							await provider.ensureSynchronized();

							for (let i = 0; i < testConfig.messagesInBatch; i++) {
								assert.strictEqual(
									localMap.get(`key${i}`),
									generated[i],
									`Wrong value for key${i} in local map`,
								);
								assert.strictEqual(
									remoteMap.get(`key${i}`),
									generated[i],
									`Wrong value for key${i} in remote map`,
								);
							}
						},
					).timeout(chunkingBatchesTimeoutMs);
				}));

			itExpects(
				"Large ops fail when compression chunking is disabled by feature gate",
				[
					{
						eventName: "fluid:telemetry:Container:ContainerClose",
						error: "BatchTooLarge",
					},
				],
				async function () {
					const maxMessageSizeInBytes = 50 * 1024; // 50 KB
					await setupContainers(
						{
							...containerConfig,
							runtimeOptions: {
								...containerConfig.runtimeOptions,
								maxBatchSizeInBytes: 51 * 1024, // 51 KB
							},
						},
						{
							"Fluid.ContainerRuntime.CompressionChunkingDisabled": true,
						},
					);

					const largeString = generateRandomStringOfSize(maxMessageSizeInBytes);
					const messageCount = 3; // Will result in a 150 KB payload
					setMapKeys(localMap, messageCount, largeString);
					await provider.ensureSynchronized();
				},
			);
		});

		describe(`Payload size on the wire - ${
			enableGroupedBatching ? "grouped" : "regular"
		} batches`, () => {
			let totalPayloadSizeInBytes = 0;
			let totalOps = 0;

			const assertPayloadSize = (totalMessageSizeInBytes: number): void => {
				// Expecting the message size on the wire should have
				// at most 35% extra from stringification and envelope overhead.
				// If any of the tests fail, this value can be increased only if
				// the payload size increase is intentional.
				const overheadRatio = 1.35;
				assert.ok(
					totalPayloadSizeInBytes < overheadRatio * totalMessageSizeInBytes,
					`Message size on the wire, ${totalPayloadSizeInBytes} is larger than expected ${
						overheadRatio * totalMessageSizeInBytes
					}, after sending ${totalMessageSizeInBytes} bytes`,
				);
			};

			const setup = async () => {
				await setupContainers(containerConfig);
				totalPayloadSizeInBytes = 0;
				totalOps = 0;
				localContainer.deltaManager.outbound.on("push", (messages) => {
					totalPayloadSizeInBytes += JSON.stringify(messages).length;
					totalOps += messages.length;
				});
			};

			const compressionRatio = 0.1;
			const badCompressionRatio = 1;
			describe("Check batch size on the wire", () =>
				[
					{
						messagesInBatch: 1,
						messageSize: 1024,
						expectedSize: 1 * 1024,
						payloadGenerator: generateStringOfSize,
					}, // One small uncompressed message
					{
						messagesInBatch: 3,
						messageSize: 1024,
						expectedSize: 3 * 1024,
						payloadGenerator: generateStringOfSize,
					}, // Three small uncompressed messages
					{
						messagesInBatch: 1,
						messageSize: compressionSizeThreshold + 1,
						expectedSize: compressionRatio * compressionSizeThreshold,
						payloadGenerator: generateStringOfSize,
					}, // One large message with compression
					{
						messagesInBatch: 20,
						messageSize: compressionSizeThreshold + 1,
						expectedSize: compressionRatio * (compressionSizeThreshold + 1),
						payloadGenerator: generateStringOfSize,
					}, // Twenty large messages with compression
					{
						messagesInBatch: 10,
						messageSize: compressionSizeThreshold + 1,
						expectedSize: badCompressionRatio * 10 * (compressionSizeThreshold + 1),
						// In order for chunking to kick in, we need to force compression to output
						// a payload larger than the payload size limit, which is done by compressing
						// random data.
						payloadGenerator: generateRandomStringOfSize,
					}, // Ten large messages with compression and chunking
				].forEach((config) => {
					it(
						"Payload size check, " +
							"Sending " +
							`${config.messagesInBatch.toLocaleString()} messages of ${config.messageSize.toLocaleString()} bytes == ` +
							`${(
								(config.messagesInBatch * config.messageSize) /
								(1024 * 1024)
							).toFixed(4)} MB, expecting ${(
								config.expectedSize /
								(1024 * 1024)
							).toFixed(4)} MB on the wire`,
						async function () {
							// This is not supported by the local server due to chunking. See ADO:2690
							// This test is flaky on tinylicious. See ADO:2964
							if (
								provider.driver.type === "local" ||
								provider.driver.type === "tinylicious"
							) {
								this.skip();
							}

							// TODO: This test is consistently failing on routerlicious. See ADO:7883 and ADO:7924
							if (provider.driver.type === "routerlicious") {
								this.skip();
							}

							await setup();

							for (let i = 0; i < config.messagesInBatch; i++) {
								localMap.set(
									`key${i}`,
									config.payloadGenerator(config.messageSize),
								);
							}

							await provider.ensureSynchronized();
							assertPayloadSize(config.expectedSize);
							assert.ok(
								!enableGroupedBatching ||
									// In case of chunking, we will have more independent messages (chunks) on the wire than in the original batch
									config.payloadGenerator === generateRandomStringOfSize ||
									totalOps === 1,
							);
						},
					).timeout(chunkingBatchesTimeoutMs);
				}));
		});
	});

	describe("Resiliency", () => {
		const messageSize = 5 * 1024 * 1024;
		const messagesInBatch = 3;
		const config: ITestContainerConfig = {
			...testContainerConfig,
			runtimeOptions: {
				summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
			},
		};

		const sendAndAssertSynchronization = async (connection: Promise<void>) => {
			const largeString = generateRandomStringOfSize(messageSize);
			setMapKeys(localMap, messagesInBatch, largeString);
			await connection;
			await provider.ensureSynchronized();

			assertMapValues(remoteMap, messagesInBatch, largeString);
			assertMapValues(localMap, messagesInBatch, largeString);
		};

		describe("Remote container", () => {
			// Forces a reconnection after processing a specified number
			// of ops which satisfy a given condition
			const reconnectAfterOpProcessing = async (
				container: IContainer,
				shouldProcess: (op: ISequencedDocumentMessage) => boolean,
				count: number,
			) => {
				let opsProcessed = 0;
				return new Promise<void>((resolve) => {
					const handler = (op) => {
						if (shouldProcess(op) && ++opsProcessed === count) {
							container.disconnect();
							container.once("connected", () => {
								resolve();
								container.off("op", handler);
							});
							container.connect();
						}
					};

					container.on("op", handler);
				});
			};

			it("Reconnects while processing chunks", async function () {
				// This is not supported by the local server. See ADO:2690
				// This test is flaky on tinylicious. See ADO:2964
				if (provider.driver.type === "local" || provider.driver.type === "tinylicious") {
					this.skip();
				}

				// TODO: This test is consistently failing when ran against FRS. See ADO:7944
				if (
					provider.driver.type === "routerlicious" &&
					provider.driver.endpointName === "frs"
				) {
					this.skip();
				}

				await setupContainers(config);
				// Force the container to reconnect after processing 2 chunked ops
				const secondConnection = reconnectAfterOpProcessing(
					remoteContainer,
					(op) =>
						(op.contents as { type?: unknown } | undefined)?.type ===
						ContainerMessageType.ChunkedOp,
					2,
				);

				await sendAndAssertSynchronization(secondConnection);
			}).timeout(chunkingBatchesTimeoutMs);

			it("Reconnects while processing compressed batch", async function () {
				// This is not supported by the local server. See ADO:2690
				// This test is flaky on tinylicious. See ADO:2964
				if (provider.driver.type === "local" || provider.driver.type === "tinylicious") {
					this.skip();
				}

				// TODO: This test is consistently failing when ran against FRS. See ADO:7944
				if (
					provider.driver.type === "routerlicious" &&
					provider.driver.endpointName === "frs"
				) {
					this.skip();
				}

				await setupContainers(config);
				// Force the container to reconnect after processing 2 empty ops
				// which would unroll the original ops from compression
				const secondConnection = reconnectAfterOpProcessing(
					remoteContainer,
					(op) => op.type === MessageType.Operation && op.contents === undefined,
					2,
				);

				await sendAndAssertSynchronization(secondConnection);
			}).timeout(chunkingBatchesTimeoutMs);
		});

		describe("Local container", () => {
			const reconnectAfterBatchSending = async (
				container: IContainer,
				shouldProcess: (batch: IDocumentMessage[]) => boolean,
				count: number,
			) => {
				let batchesSent = 0;
				return new Promise<void>((resolve) => {
					const handler = (batch) => {
						if (shouldProcess(batch) && ++batchesSent === count) {
							container.disconnect();
							container.once("connected", () => {
								resolve();
								container.deltaManager.outbound.off("op", handler);
							});
							container.connect();
						}
					};

					container.deltaManager.outbound.on("op", handler);
				});
			};

			it("Reconnects while sending chunks", async function () {
				// This is not supported by the local server. See ADO:2690
				// This test is flaky on tinylicious. See ADO:7669
				if (provider.driver.type === "local" || provider.driver.type === "tinylicious") {
					this.skip();
				}

				await setupContainers(config);
				// Force the container to reconnect after sending 2 chunked ops,
				// each in their own batch
				const secondConnection = reconnectAfterBatchSending(
					localContainer,
					(batch) =>
						batch.length === 1 &&
						JSON.parse(batch[0].contents as string)?.type ===
							ContainerMessageType.ChunkedOp,
					2,
				);

				await sendAndAssertSynchronization(secondConnection);
			}).timeout(chunkingBatchesTimeoutMs);

			it("Reconnects while sending compressed batch", async function () {
				// This is not supported by the local server. See ADO:2690
				// This test is flaky on tinylicious. See ADO:2964
				if (provider.driver.type === "local" || provider.driver.type === "tinylicious") {
					this.skip();
				}

				// TODO: This test is consistently failing when ran against FRS. See ADO:7969
				if (
					provider.driver.type === "routerlicious" &&
					provider.driver.endpointName === "frs"
				) {
					this.skip();
				}

				await setupContainers(config);
				// Force the container to reconnect after sending the compressed batch
				const secondConnection = reconnectAfterBatchSending(
					localContainer,
					(batch) =>
						batch.length > 1 && batch.slice(1).every((x) => x.contents === undefined),
					1,
				);

				await sendAndAssertSynchronization(secondConnection);
			}).timeout(chunkingBatchesTimeoutMs);
		});
	});
});
