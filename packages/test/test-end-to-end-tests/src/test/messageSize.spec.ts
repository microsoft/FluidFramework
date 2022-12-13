/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import * as crypto from "crypto";
import { strict as assert } from "assert";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestFluidObject,
    ChannelFactoryRegistry,
    ITestObjectProvider,
    ITestContainerConfig,
    DataObjectFactoryType,
} from "@fluidframework/test-utils";
import { describeNoCompat, itExpects } from "@fluidframework/test-version-utils";
import { IContainer, IErrorBase } from "@fluidframework/container-definitions";
import { GenericError } from "@fluidframework/container-utils";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { CompressionAlgorithms, ContainerMessageType } from "@fluidframework/container-runtime";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";

describeNoCompat("Message size", (getTestObjectProvider) => {
    const mapId = "mapId";
    const registry: ChannelFactoryRegistry = [
        [mapId, SharedMap.getFactory()],
    ];
    const testContainerConfig: ITestContainerConfig = {
        fluidDataObjectType: DataObjectFactoryType.Test,
        registry,
    };

    let provider: ITestObjectProvider;
    beforeEach(() => {
        provider = getTestObjectProvider();
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
        await new Promise<void>((resolve) => localContainer.once("connected", () => resolve()));
        await new Promise<void>((resolve) => remoteContainer.once("connected", () => resolve()));

        await provider.ensureSynchronized();
    };

    const generateRandomStringOfSize = (sizeInBytes: number): string =>
        crypto.randomBytes(sizeInBytes / 2).toString("hex");
    const generateStringOfSize = (sizeInBytes: number): string => new Array(sizeInBytes + 1).join("0");
    const setMapKeys = (map: SharedMap, count: number, item: string): void => {
        for (let i = 0; i < count; i++) {
            map.set(`key${i}`, item);
        }
    };

    const assertMapValues = (map: SharedMap, count: number, expected: string): void => {
        for (let i = 0; i < count; i++) {
            const value = map.get(`key${i}`);
            assert.strictEqual(value, expected, `Wrong value for key${i}`);
        }
    };

    const containerError = async (container: IContainer) =>
        new Promise<IErrorBase | undefined>((resolve) => container.once("closed", (error) => { resolve(error); }));

    itExpects("A large op will close the container", [
        { eventName: "fluid:telemetry:Container:ContainerClose", error: "BatchTooLarge" },
    ], async () => {
        const maxMessageSizeInBytes = 1024 * 1024; // 1Mb
        await setupContainers(testContainerConfig);
        const errorEvent = containerError(localContainer);

        const largeString = generateStringOfSize(maxMessageSizeInBytes + 1);
        const messageCount = 1;
        try {
            setMapKeys(dataObject1map, messageCount, largeString);
            assert(false, "should throw");
        } catch {
        }

        const error = await errorEvent;
        assert.ok(error instanceof GenericError);
        assert.ok(error.getTelemetryProperties().opSize ?? 0 > maxMessageSizeInBytes);

        // Limit has to be around 1Mb, but we should not assume here precise number.
        const limit = error.getTelemetryProperties().limit as number;
        assert(limit > maxMessageSizeInBytes / 2);
        assert(limit < maxMessageSizeInBytes * 2);
    });

    it("Small ops will pass", async () => {
        const maxMessageSizeInBytes = 800 * 1024; // slightly below 1Mb
        await setupContainers(testContainerConfig);
        const largeString = generateStringOfSize(maxMessageSizeInBytes / 10);
        const messageCount = 10;
        setMapKeys(dataObject1map, messageCount, largeString);
        await provider.ensureSynchronized();

        assertMapValues(dataObject2map, messageCount, largeString);
    });

    it("Single large op passes when smaller than the max op size", async () => {
        await setupContainers(testContainerConfig);
        // Max op size is 768000, round down to account for some overhead
        const largeString = generateStringOfSize(750000);
        const messageCount = 1;
        setMapKeys(dataObject1map, messageCount, largeString);
        await provider.ensureSynchronized();

        assertMapValues(dataObject2map, messageCount, largeString);
    });

    it("Batched small ops pass when batch is larger than max op size", async function() {
        // flush mode is not applicable for the local driver
        if (provider.driver.type === "local") {
            this.skip();
        }

        await setupContainers({ ...testContainerConfig, runtimeOptions: { flushMode: FlushMode.Immediate } });
        const largeString = generateStringOfSize(500000);
        const messageCount = 10;
        setMapKeys(dataObject1map, messageCount, largeString);
        await provider.ensureSynchronized();

        assertMapValues(dataObject2map, messageCount, largeString);
    });

    it("Single large op passes when compression enabled and over max op size", async () => {
        const maxMessageSizeInBytes = 1024 * 1024; // 1Mb
        await setupContainers({
            ...testContainerConfig,
            runtimeOptions: {
                compressionOptions: { minimumBatchSizeInBytes: 1, compressionAlgorithm: CompressionAlgorithms.lz4 }
            },
        });

        const largeString = generateStringOfSize(maxMessageSizeInBytes + 1);
        const messageCount = 1;
        setMapKeys(dataObject1map, messageCount, largeString);
    });

    it("Batched small ops pass when compression enabled and batch is larger than max op size", async function() {
        await setupContainers({
            ...testContainerConfig,
            runtimeOptions: {
                compressionOptions: { minimumBatchSizeInBytes: 1, compressionAlgorithm: CompressionAlgorithms.lz4 },
            },
        });
        const largeString = generateStringOfSize(500000);
        const messageCount = 10;
        setMapKeys(dataObject1map, messageCount, largeString);
        await provider.ensureSynchronized();

        assertMapValues(dataObject2map, messageCount, largeString);
    });

    itExpects("Large ops fail when compression is disabled and the content is over max op size", [
        { eventName: "fluid:telemetry:Container:ContainerClose", error: "BatchTooLarge" },
    ], async function() {
        const maxMessageSizeInBytes = 5 * 1024 * 1024; // 5MB
        await setupContainers(testContainerConfig); // Compression is disabled by default

        const largeString = generateRandomStringOfSize(maxMessageSizeInBytes);
        const messageCount = 3; // Will result in a 15 MB payload
        assert.throws(() => setMapKeys(dataObject1map, messageCount, largeString));
        await provider.ensureSynchronized();
    });

    itExpects("Large ops fail when compression enabled and compressed content is over max op size", [
        { eventName: "fluid:telemetry:Container:ContainerClose", error: "BatchTooLarge" },
    ], async function() {
        const maxMessageSizeInBytes = 5 * 1024 * 1024; // 5MB
        await setupContainers({
            ...testContainerConfig,
            runtimeOptions: {
                compressionOptions: { minimumBatchSizeInBytes: 1, compressionAlgorithm: CompressionAlgorithms.lz4 },
            },
        });

        const largeString = generateRandomStringOfSize(maxMessageSizeInBytes);
        const messageCount = 3; // Will result in a 15 MB payload
        setMapKeys(dataObject1map, messageCount, largeString);
        await provider.ensureSynchronized();
    });

    const chunkingBatchesConfig: ITestContainerConfig = {
        ...testContainerConfig,
        runtimeOptions: {
            compressionOptions: { minimumBatchSizeInBytes: 1, compressionAlgorithm: CompressionAlgorithms.lz4 },
            chunkSizeInBytes: 600 * 1024,
            summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
        },
    };
    const chunkingBatchesTimeoutMs = 200000;

    describe("Large payloads", () => [
        { messagesInBatch: 1, messageSize: 5 * 1024 * 1024 }, // One large message
        { messagesInBatch: 3, messageSize: 5 * 1024 * 1024 }, // Three large messages
        { messagesInBatch: 50, messageSize: 215 * 1024 }, // Many small messages
    ].forEach((config) => {
        it("Large payloads pass when compression enabled, " +
            "compressed content is over max op size and chunking enabled. " +
            `${config.messagesInBatch} messages of ${config.messageSize}b == ` +
            `${(config.messagesInBatch * config.messageSize / (1024 * 1024)).toFixed(2)} MB`, async function() {
                // This is not supported by the local server. See ADO:2690
                if (provider.driver.type === "local") {
                    this.skip();
                }

                await setupContainers(chunkingBatchesConfig);
                const largeString = generateRandomStringOfSize(config.messageSize);
                setMapKeys(dataObject1map, config.messagesInBatch, largeString);
                await provider.ensureSynchronized();

                assertMapValues(dataObject2map, config.messagesInBatch, largeString);
            }).timeout(chunkingBatchesTimeoutMs);
    }));

    describe("Large payload resiliency", () => {
        const messageSize = 5 * 1024 * 1024;
        const messagesInBatch = 3;

        describe("Remote container", () => {
            // Forces a reconnection after a number of ops have been processed
            const reconnectAfterOpProcessing = async (
                container: IContainer,
                shouldProcess: (op: ISequencedDocumentMessage) => boolean,
                count: number = 2,
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

            it("Reconnects while processing chunks", async function() {
                // This is not supported by the local server. See ADO:2690
                if (provider.driver.type === "local") {
                    this.skip();
                }

                await setupContainers(chunkingBatchesConfig);
                const secondConnection = reconnectAfterOpProcessing(
                    remoteContainer,
                    (op) => op.contents?.type === ContainerMessageType.ChunkedOp,
                );

                const largeString = generateRandomStringOfSize(messageSize);
                setMapKeys(dataObject1map, messagesInBatch, largeString);
                await secondConnection;
                await provider.ensureSynchronized();

                assertMapValues(dataObject2map, messagesInBatch, largeString);
            }).timeout(chunkingBatchesTimeoutMs);

            it("Reconnects while processing compressed batch", async function() {
                // This is not supported by the local server. See ADO:2690
                if (provider.driver.type === "local") {
                    this.skip();
                }

                await setupContainers(chunkingBatchesConfig);
                const secondConnection = reconnectAfterOpProcessing(
                    remoteContainer,
                    (op) => op.type === MessageType.Operation && op.contents === undefined,
                );
                const largeString = generateRandomStringOfSize(messageSize);
                setMapKeys(dataObject1map, messagesInBatch, largeString);
                await secondConnection;
                await provider.ensureSynchronized();

                assertMapValues(dataObject2map, messagesInBatch, largeString);
            }).timeout(chunkingBatchesTimeoutMs);
        });
    });
});
