/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactory,
    MockContainerRuntimeFactoryForReconnection,
    MockContainerRuntimeForReconnection,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { Quorum } from "../quorum";
import { QuorumFactory } from "../quorumFactory";
import { IQuorum } from "../interfaces";

function createConnectedQuorum(id: string, runtimeFactory: MockContainerRuntimeFactory) {
    // Create and connect a Quorum.
    const dataStoreRuntime = new MockFluidDataStoreRuntime();
    const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
    const services = {
        deltaConnection: containerRuntime.createDeltaConnection(),
        objectStorage: new MockStorage(),
    };

    const quorum = new Quorum(id, dataStoreRuntime, QuorumFactory.Attributes);
    quorum.connect(services);
    return quorum;
}

const createLocalQuorum = (id: string) =>
    new Quorum(id, new MockFluidDataStoreRuntime(), QuorumFactory.Attributes);

describe("Quorum", () => {
    describe("Local state", () => {
        let quorum: Quorum;

        beforeEach(() => {
            quorum = createLocalQuorum("quorum");
        });

        describe("APIs", () => {
            it("Can create a Quorum", () => {
                assert.ok(quorum, "Could not create a quorum");
            });
        });
    });

    describe("Connected state", () => {
        let quorum1: IQuorum;
        let quorum2: IQuorum;
        let containerRuntimeFactory: MockContainerRuntimeFactory;

        beforeEach(() => {
            containerRuntimeFactory = new MockContainerRuntimeFactory();
            quorum1 = createConnectedQuorum("quorum1", containerRuntimeFactory);
            quorum2 = createConnectedQuorum("quorum2", containerRuntimeFactory);
        });

        it("Can create the Quorums", async () => {
            assert.ok(quorum1, "Could not create quorum1");
            assert.ok(quorum2, "Could not create quorum1");
        });

        it("Can set a value and read it from all clients", async () => {
            const expectedKey = "key";
            const expectedValue = "value";
            const quorum1AcceptanceP = new Promise<void>((resolve) => {
                const watchForPending = (pendingKey: string) => {
                    if (pendingKey === expectedKey) {
                        assert.strictEqual(
                            quorum1.get(expectedKey),
                            undefined,
                            "Value in Quorum 1 should not be accepted yet",
                        );
                        quorum1.off("pending", watchForPending);

                        // Doing this synchronously after validating pending, since processAllMessages() won't permit
                        // us to pause after the set but before the noop.
                        const watchForAccepted = (acceptedKey: string) => {
                            if (acceptedKey === expectedKey) {
                                assert.strictEqual(
                                    quorum1.get(expectedKey),
                                    expectedValue,
                                    "Value in Quorum 1 should be accepted now",
                                );
                                quorum1.off("accepted", watchForAccepted);
                                resolve();
                            }
                        };
                        quorum1.on("accepted", watchForAccepted);
                    }
                };
                quorum1.on("pending", watchForPending);
            });
            const quorum2AcceptanceP = new Promise<void>((resolve) => {
                const watchForPending = (pendingKey: string) => {
                    if (pendingKey === expectedKey) {
                        assert.strictEqual(
                            quorum2.get(expectedKey),
                            undefined,
                            "Value in Quorum 2 should not be accepted yet",
                        );
                        quorum2.off("pending", watchForPending);

                        // Doing this synchronously after validating pending, since processAllMessages() won't permit
                        // us to pause after the set but before the noop.
                        const watchForAccepted = (acceptedKey: string) => {
                            if (acceptedKey === expectedKey) {
                                assert.strictEqual(
                                    quorum2.get(expectedKey),
                                    expectedValue,
                                    "Value in Quorum 2 should be accepted now",
                                );
                                quorum2.off("accepted", watchForAccepted);
                                resolve();
                            }
                        };
                        quorum2.on("accepted", watchForAccepted);
                    }
                };
                quorum2.on("pending", watchForPending);
            });
            quorum1.set(expectedKey, expectedValue);
            containerRuntimeFactory.processAllMessages();

            await Promise.all([quorum1AcceptanceP, quorum2AcceptanceP]);
            assert.strictEqual(quorum1.get(expectedKey), expectedValue, "Wrong value in Quorum 1");
            assert.strictEqual(quorum2.get(expectedKey), expectedValue, "Wrong value in Quorum 2");
        });
    });

    describe.skip("Detached/Attach", () => {
        describe("Behavior before attach", () => { });
        describe("Behavior after attaching", () => { });
    });

    describe("Disconnect/Reconnect", () => {
        let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
        let containerRuntime1: MockContainerRuntimeForReconnection;
        let containerRuntime2: MockContainerRuntimeForReconnection;
        let quorum1: Quorum;
        let quorum2: Quorum;

        beforeEach(async () => {
            containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

            // Create the first Quorum.
            const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
            containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
            const services1 = {
                deltaConnection: containerRuntime1.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            quorum1 = new Quorum("quorum-1", dataStoreRuntime1, QuorumFactory.Attributes);
            quorum1.connect(services1);

            // Create the second Quorum.
            const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
            containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
            const services2 = {
                deltaConnection: containerRuntime2.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            quorum2 = new Quorum("quorum-2", dataStoreRuntime2, QuorumFactory.Attributes);
            quorum2.connect(services2);
        });

        describe("Behavior transitioning to disconnect", () => {
            it("Can do something", async () => {
                assert.strict(true);
            });
        });

        describe("Behavior while disconnected", () => {
            it("Can do something", async () => {
                assert.strict(true);
            });
        });

        describe("Behavior transitioning to connected", () => {
            it("Can do something", async () => {
                assert.strict(true);
            });
        });
    });
});
