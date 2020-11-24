/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IGCTestProvider, runGCTests } from "@fluid-internal/test-dds-utils";
import {
    MockContainerRuntimeFactory,
    MockFluidDataStoreRuntime,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SharedObjectSequence } from "../sharedObjectSequence";
import { SharedObjectSequenceFactory } from "../sequenceFactory";

describe("SharedObjectSequence", () => {
    const documentId = "sequenceTests";
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

    describe("Garbage Collection", () => {
        class GCSequenceProvider implements IGCTestProvider {
            private subSequenceCount = 0;
            private _expectedRoutes: string[] = [];

            public get sharedObject() {
                // Return the remote SharedObjectSequence because we want to verify its summary data.
                return sequence2;
            }

            public get expectedOutboundRoutes() {
                return this._expectedRoutes;
            }

            public async addOutboundRoutes() {
                const subSequence1 = factory.create(dataStoreRuntime1, `subSequence-${++this.subSequenceCount}`);
                const subSequence2 = factory.create(dataStoreRuntime1, `subSequence-${++this.subSequenceCount}`);
                sequence1.insert(sequence1.getLength(), [subSequence1.handle, subSequence2.handle]);
                this._expectedRoutes.push(subSequence1.handle.absolutePath, subSequence2.handle.absolutePath);
                containerRuntimeFactory.processAllMessages();
            }

            public async deleteOutboundRoutes() {
                assert(sequence1.getLength() > 0, "Route must be added before deleting");
                const lastElementIndex = sequence1.getLength() - 1;
                // Get the handles that were last added.
                const deletedHandles = sequence1.getRange(lastElementIndex) as IFluidHandle[];
                // Get the routes of the handles.
                const deletedHandleRoutes = Array.from(deletedHandles, (handle) => handle.absolutePath);

                // Remove the last added handles.
                sequence1.remove(lastElementIndex, lastElementIndex + 1);

                // Remove the deleted routes from expected routes.
                this._expectedRoutes = this._expectedRoutes.filter((route) => !deletedHandleRoutes.includes(route));
                containerRuntimeFactory.processAllMessages();

                // Send an op so the minimum sequence number moves past the segment which got removed.
                // This will ensure that the segment is not part of the summary anymore.
                sequence1.insert(sequence1.getLength(), ["nonHandleValue"]);
                containerRuntimeFactory.processAllMessages();
            }

            public async addNestedHandles() {
                const subSequence1 = factory.create(dataStoreRuntime1, `subSequence-${++this.subSequenceCount}`);
                const subSequence2 = factory.create(dataStoreRuntime1, `subSequence-${++this.subSequenceCount}`);
                const containingObject = {
                    subSequence1Handle: subSequence1.handle,
                    nestedObj: {
                        subSequence2Handle: subSequence2.handle,
                    },
                };
                sequence1.insert(sequence1.getLength(), [containingObject]);
                this._expectedRoutes.push(subSequence1.handle.absolutePath, subSequence2.handle.absolutePath);
                containerRuntimeFactory.processAllMessages();
            }
        }

        runGCTests(GCSequenceProvider);
    });
});
