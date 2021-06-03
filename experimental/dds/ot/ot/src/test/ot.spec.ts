/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    MockContainerRuntimeFactory,
    MockFluidDataStoreRuntime,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SharedDelta, DeltaFactory } from "./delta";

const createLocalOT = (id: string) => {
    const factory = SharedDelta.getFactory();
    return factory.create(new MockFluidDataStoreRuntime(), id);
};

function createConnectedOT(id: string, runtimeFactory: MockContainerRuntimeFactory) {
    // Create and connect a second SharedCell.
    const dataStoreRuntime = new MockFluidDataStoreRuntime();
    const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
    const services = {
        deltaConnection: containerRuntime.createDeltaConnection(),
        objectStorage: new MockStorage(),
    };

    const ot = new SharedDelta(id, dataStoreRuntime, DeltaFactory.Attributes);
    ot.connect(services);
    return ot;
}

describe("SharedDelta", () => {
    describe("Local state", () => {
        let delta: SharedDelta;

        beforeEach(() => {
            delta = createLocalOT("OT");
        });

        const expect = (expected: string) => {
            assert.deepEqual(delta.text, expected);
        };

        describe("APIs", () => {
            describe("insert", () => {
                it("beginning", () => {
                    delta.insert(0, "1");
                    expect("1");

                    delta.insert(0, "0");
                    expect("01");
                });

                it("middle", () => {
                    delta.insert(0, "02");
                    expect("02");

                    delta.insert(1, "1");
                    expect("012");
                });

                it("end", () => {
                    delta.insert(0, "01");
                    expect("01");

                    delta.insert(2, "2");
                    expect("012");
                });
            });

            describe("delete", () => {
                it("beginning", () => {
                    delta.insert(0, "01");
                    expect("01");

                    delta.delete(0, 1);
                    expect("1");
                });

                it("middle", () => {
                    delta.insert(0, "012");
                    expect("012");

                    delta.delete(1, 2);
                    expect("02");
                });

                it("end", () => {
                    delta.insert(0, "01");
                    expect("01");

                    delta.delete(1, 2);
                    expect("0");
                });
            });
        });
    });

    describe("Connected state", () => {
        let doc1: SharedDelta;
        let doc2: SharedDelta;
        let containerRuntimeFactory: MockContainerRuntimeFactory;

        describe("APIs", () => {
            beforeEach(() => {
                containerRuntimeFactory = new MockContainerRuntimeFactory();
                doc1 = createConnectedOT("OT1", containerRuntimeFactory);
                doc2 = createConnectedOT("OT2", containerRuntimeFactory);
            });

            afterEach(() => { expect(); });

            const expect = (expected?: string) => {
                containerRuntimeFactory.processAllMessages();

                const actual1 = doc1.text;
                const actual2 = doc2.text;

                assert.deepEqual(actual1, actual2,
                    `doc.text must converge (doc1: '${actual1}', doc2: '${actual2}'${
                        expected !== undefined
                            ? ` expected: '${expected}'`
                            : ""})`);

                assert.deepEqual(doc1.delta, doc2.delta,
                    `doc.delta must converge (doc1: '${
                        JSON.stringify(doc1.delta)}', doc2: '${JSON.stringify(doc2.delta)})`);

                if (expected !== undefined) {
                    assert.deepEqual(actual1, expected, `doc.text must match expected (expected '${
                        expected}', but got '${actual1}')`);
                }
            };

            it("insertion race 2 before 1", () => {
                doc1.insert(0, "03");
                expect("03");

                doc1.insert(1, "2");
                doc2.insert(1, "1");
                expect("0123");
            });

            it("insertion race 1 before 2", () => {
                doc1.insert(0, "03");
                expect("03");

                doc2.insert(1, "2");
                doc1.insert(1, "1");
                expect("0123");
            });

            it("insertion race with adjacent insert", () => {
                doc1.insert(/* position: */ 0, /* text: */ "1");
                doc2.insert(/* position: */ 0, /* text: */ "0");
                doc2.insert(/* position: */ 1, /* text: */ "2");
                expect("012");
            });

            it("insert vs. delete conflict", () => {
                doc1.insert(0, "023");
                expect("023");

                doc1.insert(1, "1");
                doc2.delete(1, 2);
                expect("013");
            });

            it("delete vs. insert conflict", () => {
                doc1.insert(0, "023");
                expect("023");

                doc1.delete(1, 2);
                doc2.insert(1, "1");
                expect("013");
            });

            it("overlapping delete", () => {
                doc1.insert(0, "0123");
                expect("0123");

                doc1.delete(1, 3);
                doc2.delete(2, 3);
                expect("03");
            });
        });
    });
});
