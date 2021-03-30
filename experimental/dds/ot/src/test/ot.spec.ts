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
import { Jsonable } from "@fluidframework/datastore-definitions";
import { SharedOT } from "../ot";
import { OTFactory } from "../factory";

const createLocalOT = (id: string) => new SharedOT(id, new MockFluidDataStoreRuntime(), OTFactory.Attributes);

function createConnectedOT(id: string, runtimeFactory: MockContainerRuntimeFactory) {
    // Create and connect a second SharedCell.
    const dataStoreRuntime = new MockFluidDataStoreRuntime();
    const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
    const services = {
        deltaConnection: containerRuntime.createDeltaConnection(),
        objectStorage: new MockStorage(),
    };

    const ot = new SharedOT(id, dataStoreRuntime, OTFactory.Attributes);
    ot.connect(services);
    return ot;
}

describe("OT", () => {
    describe("Local state", () => {
        let ot: SharedOT;

        beforeEach(() => {
            ot = createLocalOT("OT");

            // eslint-disable-next-line no-null/no-null
            ot.replace([], null, {});
        });

        const expect = <T>(expected: Jsonable<T>) => {
            assert.deepEqual(ot.get(), expected);
        };

        describe("APIs", () => {
            it("Can create a OT", () => {
                assert.ok(ot, "Could not create a OT");
            });

            describe("insert()", () => {
                it("number", () => {
                    ot.insert(["x"], 1);
                    expect({ x: 1 });
                });

                it("array", () => {
                    ot.insert(["x"], []);
                    expect({ x: [] });
                });

                it("into array", () => {
                    ot.insert(["x"], []);
                    expect({ x: [] });

                    ot.insert(["x", 0], 1);
                    expect({ x: [1] });
                });
            });

            describe("remove()", () => {
                it("property from root object", () => {
                    ot.insert(["x"], 1);
                    ot.remove(["x"]);
                    expect({});
                });
            });

            describe("replace()", () => {
                it("property on root object", () => {
                    ot.insert(["x"], 1);
                    ot.replace(["x"], 1, 2);
                    expect({ x: 2 });
                });
            });

            describe("move", () => {
                it("between properties on root object", () => {
                    ot.insert(["x"], 1);
                    ot.move(["x"], ["y"]);
                    expect({ y: 1 });
                });
            });
        });
    });

    describe("Connected state", () => {
        let ot1: SharedOT;
        let ot2: SharedOT;
        let containerRuntimeFactory: MockContainerRuntimeFactory;

        describe("APIs", () => {
            beforeEach(() => {
                containerRuntimeFactory = new MockContainerRuntimeFactory();
                ot1 = createConnectedOT("OT1", containerRuntimeFactory);
                ot2 = createConnectedOT("OT2", containerRuntimeFactory);

                // eslint-disable-next-line no-null/no-null
                ot1.replace([], null, {});
            });

            const expect = <T>(expected: Jsonable<T>) => {
                containerRuntimeFactory.processAllMessages();
                assert.deepEqual(ot1.get(), expected);
                assert.deepEqual(ot2.get(), expected);
            };

            it("ensure change propagates", () => {
                ot1.insert(["x"], 1);
                expect({ x: 1 });
            });
        });
    });
});
