/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
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

function createConnectedSequence(id: string, runtimeFactory: MockContainerRuntimeFactory) {
    const dataStoreRuntime = new MockFluidDataStoreRuntime();
    const sequence = new SharedObjectSequence(dataStoreRuntime, id, SharedObjectSequenceFactory.Attributes);
    const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
    const services = {
        deltaConnection: containerRuntime.createDeltaConnection(),
        objectStorage: new MockStorage(undefined),
    };
    sequence.connect(services);
    sequence.initializeLocal();
    return sequence;
}

function createLocalSequence(id: string) {
    const factory = new SharedObjectSequenceFactory();
    return factory.create(new MockFluidDataStoreRuntime(), id);
}

describe("SharedObjectSequence", () => {
    describe("Garbage Collection", () => {
        class GCSequenceProvider implements IGCTestProvider {
            private subSequenceCount = 0;
            private _expectedRoutes: string[] = [];
            private readonly containerRuntimeFactory: MockContainerRuntimeFactory;
            private readonly sequence1: SharedObjectSequence<any>;
            private readonly sequence2: SharedObjectSequence<any>;

            constructor() {
                this.containerRuntimeFactory = new MockContainerRuntimeFactory();
                this.sequence1 = createConnectedSequence("sequence1", this.containerRuntimeFactory);
                this.sequence2 = createConnectedSequence("sequence2", this.containerRuntimeFactory);
            }

            public get sharedObject() {
                // Return the remote SharedObjectSequence because we want to verify its summary data.
                return this.sequence2;
            }

            public get expectedOutboundRoutes() {
                return this._expectedRoutes;
            }

            public async addOutboundRoutes() {
                const subSequence1 = createLocalSequence(`subSequence-${++this.subSequenceCount}`);
                const subSequence2 = createLocalSequence(`subSequence-${++this.subSequenceCount}`);
                this.sequence1.insert(this.sequence1.getLength(), [subSequence1.handle, subSequence2.handle]);
                this._expectedRoutes.push(subSequence1.handle.absolutePath, subSequence2.handle.absolutePath);
                this.containerRuntimeFactory.processAllMessages();
            }

            public async deleteOutboundRoutes() {
                assert(this.sequence1.getLength() > 0, "Route must be added before deleting");
                const lastElementIndex = this.sequence1.getLength() - 1;
                // Get the handles that were last added.
                const deletedHandles = this.sequence1.getRange(lastElementIndex) as IFluidHandle[];
                // Get the routes of the handles.
                const deletedHandleRoutes = Array.from(deletedHandles, (handle) => handle.absolutePath);

                // Remove the last added handles.
                this.sequence1.remove(lastElementIndex, lastElementIndex + 1);

                // Remove the deleted routes from expected routes.
                this._expectedRoutes = this._expectedRoutes.filter((route) => !deletedHandleRoutes.includes(route));
                this.containerRuntimeFactory.processAllMessages();

                // Send an op so the minimum sequence number moves past the segment which got removed.
                // This will ensure that the segment is not part of the summary anymore.
                this.sequence1.insert(this.sequence1.getLength(), ["nonHandleValue"]);
                this.containerRuntimeFactory.processAllMessages();
            }

            public async addNestedHandles() {
                const subSequence1 = createLocalSequence(`subSequence-${++this.subSequenceCount}`);
                const subSequence2 = createLocalSequence(`subSequence-${++this.subSequenceCount}`);
                const containingObject = {
                    subSequence1Handle: subSequence1.handle,
                    nestedObj: {
                        subSequence2Handle: subSequence2.handle,
                    },
                };
                this.sequence1.insert(this.sequence1.getLength(), [containingObject]);
                this._expectedRoutes.push(subSequence1.handle.absolutePath, subSequence2.handle.absolutePath);
                this.containerRuntimeFactory.processAllMessages();
            }
        }

        runGCTests(GCSequenceProvider);
    });
});
