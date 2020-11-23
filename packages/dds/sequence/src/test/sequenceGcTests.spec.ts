/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
    MockContainerRuntimeFactory,
    MockFluidDataStoreRuntime,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SharedObjectSequence } from "../sharedObjectSequence";
import { SharedObjectSequenceFactory } from "../sequenceFactory";

describe("Garbage Collection", () => {
    const documentId = "sequenceGCTests";
    const factory = new SharedObjectSequenceFactory();
    let containerRuntimeFactory: MockContainerRuntimeFactory;
    let dataStoreRuntime1: MockFluidDataStoreRuntime;
    let sequence1: SharedObjectSequence<any>;
    let sequence2: SharedObjectSequence<any>;

    beforeEach(() => {
        containerRuntimeFactory = new MockContainerRuntimeFactory();

        dataStoreRuntime1 = new MockFluidDataStoreRuntime();
        sequence1 =
            new SharedObjectSequence(dataStoreRuntime1, documentId, SharedObjectSequenceFactory.Attributes);
        const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
        const services1 = {
            deltaConnection: containerRuntime1.createDeltaConnection(),
            objectStorage: new MockStorage(undefined),
        };
        sequence1.connect(services1);
        sequence1.initializeLocal();

        const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
        sequence2 =
            new SharedObjectSequence(dataStoreRuntime2, documentId, SharedObjectSequenceFactory.Attributes);
        const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
        const services2 = {
            deltaConnection: containerRuntime2.createDeltaConnection(),
            objectStorage: new MockStorage(undefined),
        };
        sequence2.connect(services2);
        sequence2.initializeLocal();
    });

    describe("SharedObjectSequence", () => {
        it("can generate GC nodes with handles in data", () => {
            const subSequence1 = factory.create(dataStoreRuntime1, "subSequence1");
            const subSequence2 = factory.create(dataStoreRuntime1, "subSequence2");
            sequence1.insert(0, [subSequence1.handle, subSequence2.handle]);

            containerRuntimeFactory.processAllMessages();

            // Verify the GC nodes returned by summarize.
            const gcNodes = sequence1.summarize().gcNodes;
            assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
            assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
            assert.deepStrictEqual(
                gcNodes[0].outboundRoutes,
                [
                    subSequence1.handle.absolutePath,
                    subSequence2.handle.absolutePath,
                ],
                "GC node's outbound routes is incorrect");
        });

        it("can generate GC nodes when handles are removed from data", () => {
            const subSequence1 = factory.create(dataStoreRuntime1, "subSequence1");
            const subSequence2 = factory.create(dataStoreRuntime1, "subSequence2");
            sequence1.insert(0, [subSequence1.handle]);
            containerRuntimeFactory.processAllMessages();

            sequence1.insert(1, [subSequence2.handle]);
            containerRuntimeFactory.processAllMessages();

            // Verify the GC nodes returned by summarize.
            let gcNodes = sequence1.summarize().gcNodes;
            assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
            assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
            assert.deepStrictEqual(
                gcNodes[0].outboundRoutes,
                [
                    subSequence1.handle.absolutePath,
                    subSequence2.handle.absolutePath,
                ],
                "GC node's outbound routes is incorrect");

            // Remove one of the handles.
            sequence1.remove(1, 2);
            containerRuntimeFactory.processAllMessages();

            // Send an op so the minimum sequence number moves past the segment which got removed.
            // This will ensure that the segment is not part of the summary anymore.
            sequence1.insert(1, [undefined]);
            containerRuntimeFactory.processAllMessages();

            gcNodes = sequence1.summarize().gcNodes;
            assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
            assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
            assert.deepStrictEqual(
                gcNodes[0].outboundRoutes,
                [
                    subSequence1.handle.absolutePath,
                ],
                "GC node's outbound routes is incorrect");
        });

        it("can generate GC nodes when handles are added to data", () => {
            const subSequence1 = factory.create(dataStoreRuntime1, "subSequence1");
            sequence1.insert(0, [subSequence1.handle]);
            containerRuntimeFactory.processAllMessages();

            // Verify the GC nodes returned by summarize.
            let gcNodes = sequence1.summarize().gcNodes;
            assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
            assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
            assert.deepStrictEqual(
                gcNodes[0].outboundRoutes,
                [
                    subSequence1.handle.absolutePath,
                ],
                "GC node's outbound routes is incorrect");

            // Add another handle to the sequence.
            const subSequence2 = factory.create(dataStoreRuntime1, "subSequence2");
            sequence1.insert(1, [subSequence2.handle]);
            containerRuntimeFactory.processAllMessages();

            gcNodes = sequence1.summarize().gcNodes;
            assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
            assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
            assert.deepStrictEqual(
                gcNodes[0].outboundRoutes,
                [
                    subSequence1.handle.absolutePath,
                    subSequence2.handle.absolutePath,
                ],
                "GC node's outbound routes is incorrect");
        });

        it("can generate GC nodes with nested handles in data", () => {
            const subSequence1 = factory.create(dataStoreRuntime1, "subSequence1");
            const subSequence2 = factory.create(dataStoreRuntime1, "subSequence2");

            const containingObject = {
                subSequence1Handle: subSequence1.handle,
                nestedObj: {
                    subSequence2Handle: subSequence2.handle,
                },
            };
            sequence1.insert(0, [containingObject]);
            containerRuntimeFactory.processAllMessages();

            // Verify the GC nodes returned by summarize.
            const gcNodes = sequence1.summarize().gcNodes;
            assert.strictEqual(gcNodes.length, 1, "There should only be one GC node in summary");
            assert.strictEqual(gcNodes[0].id, "/", "GC node's id should be /");
            assert.deepStrictEqual(
                gcNodes[0].outboundRoutes,
                [
                    subSequence1.handle.absolutePath,
                    subSequence2.handle.absolutePath,
                ],
                "GC node's outbound routes is incorrect");
        });
    });
});
