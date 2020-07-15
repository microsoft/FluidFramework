/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { ContainerMessageType } from "@fluidframework/container-runtime";
import { IContainerRuntime } from  "@fluidframework/container-runtime-definitions";
import { SharedMap } from "@fluidframework/map";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IEnvelope, SchedulerType, FlushMode } from "@fluidframework/runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createLocalLoader,
    TestDeltaProcessingManager,
    initializeLocalContainer,
    ITestFluidComponent,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";

describe("Batching", () => {
    const id = `fluid-test://localhost/batchingTest`;
    const map1Id = "map1Key";
    const map2Id = "map2Key";
    const codeDetails: IFluidCodeDetails = {
        package: "batchingTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let deltaProcessingManager: TestDeltaProcessingManager;
    let component1: ITestFluidComponent;
    let component2: ITestFluidComponent;
    let component1map1: SharedMap;
    let component1map2: SharedMap;
    let component2map1: SharedMap;
    let component2map2: SharedMap;

    async function createContainer(): Promise<Container> {
        const factory = new TestFluidComponentFactory(
            [
                [map1Id, SharedMap.getFactory()],
                [map2Id, SharedMap.getFactory()],
            ],
        );
        const loader = createLocalLoader([[codeDetails, factory]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    async function getComponent(componentId: string, container: Container): Promise<ITestFluidComponent> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as ITestFluidComponent;
    }

    function setupBacthMessageListener(component: ITestFluidComponent, receivedMessages: ISequencedDocumentMessage[]) {
        component.context.containerRuntime.on("op", (message: ISequencedDocumentMessage) => {
            if (message.type === ContainerMessageType.ComponentOp) {
                const envelope = message.contents as IEnvelope;
                if (envelope.address !== `${SchedulerType}`) {
                    receivedMessages.push(message);
                }
            }
        });
    }

    function verifyBatchMetadata(batchMessages: ISequencedDocumentMessage[]) {
        const batchCount = batchMessages.length;
        assert(batchCount !== 0, "No messages in the batch");

        const batchBeginMetadata = batchMessages[0].metadata?.batch;
        const batchEndMetadata = batchMessages[batchCount - 1].metadata?.batch;
        if (batchCount === 1) {
            assert.equal(batchBeginMetadata, undefined, "Batch with one message should not have batch metadata");
            return;
        }

        assert.equal(batchBeginMetadata, true, "Batch begin metadata not found");
        assert.equal(batchEndMetadata, false, "Batch end metadata not found");
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();

        const container1 = await createContainer();
        component1 = await getComponent("default", container1);
        component1map1 = await component1.getSharedObject<SharedMap>(map1Id);
        component1map2 = await component1.getSharedObject<SharedMap>(map2Id);

        const container2 = await createContainer();
        component2 = await getComponent("default", container2);
        component2map1 = await component2.getSharedObject<SharedMap>(map1Id);
        component2map2 = await component2.getSharedObject<SharedMap>(map2Id);

        deltaProcessingManager = new TestDeltaProcessingManager(deltaConnectionServer);
        deltaProcessingManager.registerDeltaManagers(component1.runtime.deltaManager, component2.runtime.deltaManager);

        await deltaProcessingManager.process();
    });

    describe("Local ops batch metadata verification", () => {
        let component1BatchMessages: ISequencedDocumentMessage[] = [];
        let component2BatchMessages: ISequencedDocumentMessage[] = [];

        beforeEach(() => {
            setupBacthMessageListener(component1, component1BatchMessages);
            setupBacthMessageListener(component2, component2BatchMessages);
        });

        describe("Automatic batches via orderSequentially", () => {
            it("can send and receive mulitple batch ops correctly", async () => {
                // Send messages in batch in the first component.
                component1.context.containerRuntime.orderSequentially(() => {
                    component1map1.set("key1", "value1");
                    component1map2.set("key2", "value2");
                    component1map1.set("key3", "value3");
                    component1map2.set("key4", "value4");
                });

                // Wait for the ops to get processed by both the containers.
                await deltaProcessingManager.process();

                assert.equal(
                    component1BatchMessages.length, 4, "Incorrect number of messages received on local client");
                assert.equal(
                    component2BatchMessages.length, 4, "Incorrect number of messages received on remote client");

                verifyBatchMetadata(component1BatchMessages);
                verifyBatchMetadata(component2BatchMessages);
            });

            it("can send and receive single batch op correctly", async () => {
                component2.context.containerRuntime.orderSequentially(() => {
                    component2map1.set("key1", "value1");
                });

                // Wait for the ops to get processed by both the containers.
                await deltaProcessingManager.process();

                assert.equal(
                    component1BatchMessages.length, 1, "Incorrect number of messages received on local client");
                assert.equal(
                    component2BatchMessages.length, 1, "Incorrect number of messages received on remote client");

                verifyBatchMetadata(component1BatchMessages);
                verifyBatchMetadata(component2BatchMessages);
            });

            it("can send and receive consecutive batches correctly", async () => {
                /**
                 * This test verifies that among other things, the PendingStateManager's algorithm of handling
                 * consecutive batches is correct.
                 */
                component2.context.containerRuntime.orderSequentially(() => {
                    component2map1.set("key1", "value1");
                    component2map2.set("key2", "value2");
                });

                component2.context.containerRuntime.orderSequentially(() => {
                    component2map1.set("key3", "value3");
                    component2map2.set("key4", "value4");
                });

                // Wait for the ops to get processed by both the containers.
                await deltaProcessingManager.process();

                assert.equal(
                    component1BatchMessages.length, 4, "Incorrect number of messages received on local client");
                assert.equal(
                    component2BatchMessages.length, 4, "Incorrect number of messages received on remote client");

                // Verify the local client's batches.
                verifyBatchMetadata(component1BatchMessages.slice(0, 2));
                verifyBatchMetadata(component1BatchMessages.slice(2, 4));

                // Verify the remote client's batches.
                verifyBatchMetadata(component2BatchMessages.slice(0, 2));
                verifyBatchMetadata(component2BatchMessages.slice(2, 4));
            });

            it("can handle calls to orderSequentially with no batch messages", async () => {
                /**
                 * This test verifies that among other things, the PendingStateManager's algorithm of handling batches
                 * with no messages is correct.
                 */
                component1.context.containerRuntime.orderSequentially(() => {
                });

                // Wait for the ops to get processed by both the containers.
                await deltaProcessingManager.process();

                assert.equal(
                    component1BatchMessages.length, 0, "Incorrect number of messages received on local client");
                assert.equal(
                    component2BatchMessages.length, 0, "Incorrect number of messages received on remote client");
            });

            it("can handle nested orderSequentially by ignoring inner calls to it", async () => {
                // If orderSequentially is nested, only the outermost is considered as the beginning and end of the
                // batch. The inner ones are ignored.
                component1.context.containerRuntime.orderSequentially(() => {
                    component1map1.set("key1", "value1");
                    // Level 1 nesting.
                    component1.context.containerRuntime.orderSequentially(() => {
                        component1map2.set("key2", "value2");
                        // Level 2 nesting.
                        component1.context.containerRuntime.orderSequentially(() => {
                            component1map1.set("key3", "value3");
                        });
                    });
                    component1map2.set("key4", "value4");
                });

                // Wait for the ops to get processed by both the containers.
                await deltaProcessingManager.process();

                assert.equal(
                    component1BatchMessages.length, 4, "Incorrect number of messages received on local client");
                assert.equal(
                    component2BatchMessages.length, 4, "Incorrect number of messages received on remote client");

                verifyBatchMetadata(component1BatchMessages);
                verifyBatchMetadata(component2BatchMessages);
            });
        });

        describe("Manually flushed batches", () => {
            it("can send and receive mulitple batch ops that are manually flushed", async () => {
                // Set the FlushMode to Manual.
                component1.context.containerRuntime.setFlushMode(FlushMode.Manual);

                // Send the ops that are to be batched together.
                component1map1.set("key1", "value1");
                component1map2.set("key2", "value2");
                component1map1.set("key3", "value3");
                component1map2.set("key4", "value4");

                // Manually flush the batch.
                (component1.context.containerRuntime as IContainerRuntime).flush();

                // Wait for the ops to get processed by both the containers.
                await deltaProcessingManager.process();

                assert.equal(
                    component1BatchMessages.length, 4, "Incorrect number of messages received on local client");
                assert.equal(
                    component2BatchMessages.length, 4, "Incorrect number of messages received on remote client");

                verifyBatchMetadata(component1BatchMessages);
                verifyBatchMetadata(component2BatchMessages);
            });

            it("can send and receive single batch op that is manually flushed", async () => {
                // Manually flush a single message as a batch.
                component2.context.containerRuntime.setFlushMode(FlushMode.Manual);
                component2map1.set("key1", "value1");
                (component2.context.containerRuntime as IContainerRuntime).flush();

                // Set the FlushMode back to Automatic.
                component2.context.containerRuntime.setFlushMode(FlushMode.Automatic);

                // Wait for the ops to get processed by both the containers.
                await deltaProcessingManager.process();

                assert.equal(
                    component1BatchMessages.length, 1, "Incorrect number of messages received on local client");
                assert.equal(
                    component2BatchMessages.length, 1, "Incorrect number of messages received on remote client");

                verifyBatchMetadata(component1BatchMessages);
                verifyBatchMetadata(component2BatchMessages);
            });

            it("can send and receive consecutive batches that are manually flushed", async () => {
                /**
                 * This test verifies that among other things, the PendingStateManager's algorithm of handling
                 * consecutive batches is correct.
                 */

                // Set the FlushMode to Manual.
                component2.context.containerRuntime.setFlushMode(FlushMode.Manual);

                // Send the ops that are to be batched together.
                component2map1.set("key1", "value1");
                component2map2.set("key2", "value2");

                // Manually flush the batch.
                (component2.context.containerRuntime as IContainerRuntime).flush();

                // Send the second set of ops that are to be batched together.
                component2map1.set("key3", "value3");
                component2map2.set("key4", "value4");

                // Manually flush the batch.
                (component2.context.containerRuntime as IContainerRuntime).flush();

                // Send a third set of ops that are to be batched together.
                component2map1.set("key5", "value5");
                component2map2.set("key6", "value6");

                // Manually flush the batch.
                (component2.context.containerRuntime as IContainerRuntime).flush();

                // Set the FlushMode back to Automatic.
                component2.context.containerRuntime.setFlushMode(FlushMode.Automatic);

                // Wait for the ops to get processed by both the containers.
                await deltaProcessingManager.process();

                assert.equal(
                    component1BatchMessages.length, 6, "Incorrect number of messages received on local client");
                assert.equal(
                    component2BatchMessages.length, 6, "Incorrect number of messages received on remote client");

                // Verify the local client's batches.
                verifyBatchMetadata(component1BatchMessages.slice(0, 2));
                verifyBatchMetadata(component1BatchMessages.slice(2, 4));
                verifyBatchMetadata(component1BatchMessages.slice(4, 6));

                // Verify the remote client's batches.
                verifyBatchMetadata(component2BatchMessages.slice(0, 2));
                verifyBatchMetadata(component2BatchMessages.slice(2, 4));
                verifyBatchMetadata(component2BatchMessages.slice(4, 6));
            });
        });

        afterEach(async () => {
            component1BatchMessages = [];
            component2BatchMessages = [];
        });
    });

    describe("Document Dirty State", () => {
        // Verifies that the document dirty state for the given document is as expected.
        function verifyDocumentDirtyState(component: ITestFluidComponent, expectedState: boolean) {
            const dirty = (component.context.containerRuntime as IContainerRuntime).isDocumentDirty();
            assert.equal(dirty, expectedState, "The document dirty state is not as expected");
        }

        describe("Automatic batches via orderSequentially", () => {
            it("should clean document dirty state after a batch with single message is sent", async () => {
                // Send a batch with a single message.
                component1.context.containerRuntime.orderSequentially(() => {
                    component1map1.set("key1", "value1");
                });

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(component1, true);

                // Wait for the ops to get processed by both the containers.
                await deltaProcessingManager.process();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(component1, false);
            });

            it("should clean document dirty state after a batch with multiple messages is sent", async () => {
                // Send a batch with multiple messages.
                component1.context.containerRuntime.orderSequentially(() => {
                    component1map1.set("key1", "value1");
                    component1map2.set("key2", "value2");
                    component1map1.set("key3", "value3");
                });

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(component1, true);

                // Wait for the ops to get processed by both the containers.
                await deltaProcessingManager.process();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(component1, false);
            });

            it("should clean document dirty state after consecutive batches are sent", async () => {
                // Send a couple of batches consecutively.
                component1.context.containerRuntime.orderSequentially(() => {
                    component1map1.set("key1", "value1");
                });

                component1.context.containerRuntime.orderSequentially(() => {
                    component1map2.set("key2", "value2");
                    component1map1.set("key3", "value3");
                    component1map2.set("key4", "value4");
                });

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(component1, true);

                // Wait for the ops to get processed by both the containers.
                await deltaProcessingManager.process();

                // Check that the document dirty state is cleaned after the ops are processed.
                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(component1, false);
            });

            it("should clean document dirty state after batch and non-batch messages are sent", async () => {
                // Send a non-batch message.
                component1map1.set("key1", "value1");

                // Send a couple of batches consecutively.
                component1.context.containerRuntime.orderSequentially(() => {
                    component1map2.set("key2", "value2");
                    component1map1.set("key3", "value3");
                    component1map2.set("key4", "value4");
                });

                component1.context.containerRuntime.orderSequentially(() => {
                    component1map1.set("key5", "value5");
                });

                // Send another non-batch message.
                component1map1.set("key5", "value5");

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(component1, true);

                // Wait for the ops to get processed by both the containers.
                await deltaProcessingManager.process();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(component1, false);
            });
        });

        describe("Manually flushed batches", () => {
            it("should clean document dirty state after a batch with single message is flushed", async () => {
                // Manually flush a single batch message.
                component1.context.containerRuntime.setFlushMode(FlushMode.Manual);
                component1map1.set("key1", "value1");
                (component1.context.containerRuntime as IContainerRuntime).flush();

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(component1, true);

                // Wait for the ops to get processed by both the containers.
                await deltaProcessingManager.process();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(component1, false);
            });

            it("should clean document dirty state after a batch with multiple messages is flushed", async () => {
                // Manually flush a batch with multiple messages.
                component1.context.containerRuntime.setFlushMode(FlushMode.Manual);
                component1map1.set("key1", "value1");
                component1map2.set("key2", "value2");
                component1map1.set("key3", "value3");
                (component1.context.containerRuntime as IContainerRuntime).flush();
                component1.context.containerRuntime.setFlushMode(FlushMode.Automatic);

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(component1, true);

                // Wait for the ops to get processed by both the containers.
                await deltaProcessingManager.process();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(component1, false);
            });

            it("should clean document dirty state after consecutive batches are flushed", async () => {
                // Flush a couple of batches consecutively.
                component1.context.containerRuntime.setFlushMode(FlushMode.Manual);
                component1map1.set("key1", "value1");
                (component1.context.containerRuntime as IContainerRuntime).flush();

                component1map2.set("key2", "value2");
                component1map1.set("key3", "value3");
                component1map2.set("key4", "value4");
                component1.context.containerRuntime.setFlushMode(FlushMode.Automatic);

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(component1, true);

                // Wait for the ops to get processed by both the containers.
                await deltaProcessingManager.process();

                // Check that the document dirty state is cleaned after the ops are processed.
                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(component1, false);
            });

            it("should clean document dirty state after batch and non-batch messages are flushed", async () => {
                // Send a non-batch message.
                component1map1.set("key1", "value1");

                // Flush a couple of batches consecutively.
                component1.context.containerRuntime.setFlushMode(FlushMode.Manual);
                component1map2.set("key2", "value2");
                component1map1.set("key3", "value3");
                component1map2.set("key4", "value4");
                (component1.context.containerRuntime as IContainerRuntime).flush();

                component1map1.set("key5", "value5");
                (component1.context.containerRuntime as IContainerRuntime).flush();

                // Send another non-batch message.
                component1map1.set("key5", "value5");

                // Set the FlushMode back to Automatic.
                component1.context.containerRuntime.setFlushMode(FlushMode.Automatic);

                // Verify that the document is correctly set to dirty.
                verifyDocumentDirtyState(component1, true);

                // Wait for the ops to get processed by both the containers.
                await deltaProcessingManager.process();

                // Verify that the document dirty state is cleaned after the ops are processed.
                verifyDocumentDirtyState(component1, false);
            });
        });
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
