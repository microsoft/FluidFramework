/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import assert from "assert";
import { MockDeltaConnectionFactory, MockRuntime, MockStorage } from "@microsoft/fluid-test-runtime-utils";
import { SharedNumberSequence } from "../sharedNumberSequence";
import { SharedNumberSequenceFactory } from "../sequenceFactory";

describe("SharedNumberSequence", () => {
    const documentId = "fakeId";
    let deltaConnectionFactory: MockDeltaConnectionFactory;
    let sharedNumberSequence: SharedNumberSequence;
    beforeEach(() => {
        const runtime = new MockRuntime();
        deltaConnectionFactory = new MockDeltaConnectionFactory();
        sharedNumberSequence = new SharedNumberSequence(runtime, documentId, SharedNumberSequenceFactory.Attributes);
        runtime.services = {
            deltaConnection: deltaConnectionFactory.createDeltaConnection(runtime),
            objectStorage: new MockStorage(undefined),
        };
        runtime.attach();
    });

    describe("getItems", () => {
        it("insert and get items", async () => {
            sharedNumberSequence.insert(0, [2, 11], undefined);
            sharedNumberSequence.insert(0, [4, 5, 6], undefined);
            sharedNumberSequence.insert(5, [1, 5, 6, 2, 3], undefined);
            sharedNumberSequence.insert(0, [9, 12], undefined);

            let items = sharedNumberSequence.getItems(1, 6);
            console.log(items);
            assert(verifyItems(items, [12, 4, 5, 6, 2]));

            items = sharedNumberSequence.getItems(4, 10);
            console.log(items);
            assert(verifyItems(items, [6, 2, 11, 1, 5, 6]));

            items = sharedNumberSequence.getItems(0);
            console.log(items);
            assert(verifyItems(items, [9, 12, 4, 5, 6, 2, 11, 1, 5, 6, 2, 3]));

            items = sharedNumberSequence.getItems(1, 1);
            console.log(items);
            assert(verifyItems(items, []));
        });

        function verifyItems(actual: number[], expected: number[]): boolean {
            if (actual.length !== expected.length) {
                return false;
            }
            for (let i = 0; i < expected.length; i++) {
                if (actual[i] !== expected[i]) {
                    return false;
                }
            }
            return true;
        }
    });
});
