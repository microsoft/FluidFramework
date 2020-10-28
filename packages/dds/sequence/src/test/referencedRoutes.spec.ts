/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
    MockContainerRuntimeFactory,
    MockFluidDataStoreRuntime,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SharedObjectSequence } from "../sharedObjectSequence";
import { SharedObjectSequenceFactory } from "../sequenceFactory";

describe("Referenced Routes", () => {
    const documentId = "fakeId";
    const factory = new SharedObjectSequenceFactory();
    let dataStoreRuntime: MockFluidDataStoreRuntime;
    let containerRuntimeFactory: MockContainerRuntimeFactory;
    let sharedObjectSequence: SharedObjectSequence<IFluidHandle>;

    beforeEach(() => {
        dataStoreRuntime = new MockFluidDataStoreRuntime();
        sharedObjectSequence =
            new SharedObjectSequence(dataStoreRuntime, documentId, SharedObjectSequenceFactory.Attributes);

        containerRuntimeFactory = new MockContainerRuntimeFactory();
        const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
        const services = {
            deltaConnection: containerRuntime.createDeltaConnection(),
            objectStorage: new MockStorage(undefined),
        };
        sharedObjectSequence.connect(services);
        sharedObjectSequence.initializeLocal();
    });

    describe("SharedObjectSequence", () => {
        it("can generate referenced routes for handles", () => {
            const subSequence = factory.create(dataStoreRuntime, "subSequence");
            sharedObjectSequence.insert(0, [subSequence.handle]);

            containerRuntimeFactory.processAllMessages();

            // Verify the referenced routes returned by snapshot.
            const routeDetails = sharedObjectSequence.snapshot().routeDetails;
            assert.strictEqual(
                routeDetails.source,
                sharedObjectSequence.id,
                "Source of the referenced routes should be sequence's id");
            assert.deepStrictEqual(
                routeDetails.routes, [subSequence.handle.absolutePath], "Referenced routes is incorrect");
        });

        it("can generate referenced routes for multiple handles", () => {
            const subSequence = factory.create(dataStoreRuntime, "subSequence");
            const subSequence2 = factory.create(dataStoreRuntime, "subSequence2");
            sharedObjectSequence.insert(0, [subSequence.handle, subSequence2.handle]);

            containerRuntimeFactory.processAllMessages();

            // Verify the referenced routes returned by snapshot.
            const routeDetails = sharedObjectSequence.snapshot().routeDetails;
            assert.strictEqual(
                routeDetails.source,
                sharedObjectSequence.id,
                "Source of the referenced routes should be sequence's id");
            assert.deepStrictEqual(
                routeDetails.routes,
                [subSequence.handle.absolutePath, subSequence2.handle.absolutePath],
                "Referenced routes is incorrect");
        });

        it("can generate referenced routes for removed handles", () => {
            const subSequence = factory.create(dataStoreRuntime, "subSequence");
            const subSequence2 = factory.create(dataStoreRuntime, "subSequence2");
            sharedObjectSequence.insert(0, [subSequence.handle]);
            containerRuntimeFactory.processAllMessages();

            sharedObjectSequence.insert(1, [subSequence2.handle]);
            containerRuntimeFactory.processAllMessages();

            // Verify the referenced routes returned by snapshot.
            let routeDetails = sharedObjectSequence.snapshot().routeDetails;
            assert.strictEqual(
                routeDetails.source,
                sharedObjectSequence.id,
                "Source of the referenced routes should be sequence's id");
            assert.deepStrictEqual(
                routeDetails.routes,
                [subSequence.handle.absolutePath, subSequence2.handle.absolutePath],
                "Referenced routes is incorrect");

            // Remove the handle at position 1 and wait for it to be processed.
            sharedObjectSequence.remove(1, 2);
            containerRuntimeFactory.processAllMessages();

            // Send an op so the minimum sequence number moves past the segment which got removed.
            // This will ensure that the segment is not part of the snapshot anymore.
            sharedObjectSequence.insert(1, [undefined]);
            containerRuntimeFactory.processAllMessages();

            routeDetails = sharedObjectSequence.snapshot().routeDetails;
            assert.strictEqual(
                routeDetails.source,
                sharedObjectSequence.id,
                "Source of the referenced routes should be sequence's id");
            assert.deepStrictEqual(
                routeDetails.routes,
                [subSequence.handle.absolutePath],
                "Referenced routes is incorrect");
        });
    });
});
