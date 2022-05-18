/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line unicorn/prefer-node-protocol
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

function createConnectedQuorum(id: string, runtimeFactory: MockContainerRuntimeFactory): Quorum {
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

const createLocalQuorum = (id: string): Quorum =>
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

    describe("Connected state, single client", () => {
        let quorum: IQuorum;
        let containerRuntimeFactory: MockContainerRuntimeFactory;

        beforeEach(() => {
            containerRuntimeFactory = new MockContainerRuntimeFactory();
            quorum = createConnectedQuorum("quorum", containerRuntimeFactory);
        });

        it("Can create the Quorum", async () => {
            assert.ok(quorum, "Could not create quorum");
        });

        it("Can set a value and read it from all clients", async () => {
            const expectedKey = "key";
            const expectedValue = "value";
            const quorumAcceptanceP = new Promise<void>((resolve) => {
                const watchForPending = (pendingKey: string): void => {
                    if (pendingKey === expectedKey) {
                        assert.strictEqual(
                            quorum.getPending(expectedKey),
                            expectedValue,
                            "Value in Quorum should be pending now",
                        );
                        assert.strictEqual(
                            quorum.get(expectedKey),
                            undefined,
                            "Value in Quorum should not be accepted yet",
                        );
                        quorum.off("pending", watchForPending);

                        // Doing this synchronously after validating pending, since processAllMessages() won't permit
                        // us to pause after the set but before the noop.
                        const watchForAccepted = (acceptedKey: string): void => {
                            if (acceptedKey === expectedKey) {
                                assert.strictEqual(
                                    quorum.getPending(expectedKey),
                                    undefined,
                                    "Value in Quorum should not be pending anymore",
                                );
                                assert.strictEqual(
                                    quorum.get(expectedKey),
                                    expectedValue,
                                    "Value in Quorum should be accepted now",
                                );
                                quorum.off("accepted", watchForAccepted);
                                resolve();
                            }
                        };
                        quorum.on("accepted", watchForAccepted);
                    }
                };
                quorum.on("pending", watchForPending);
            });
            quorum.set(expectedKey, expectedValue);
            containerRuntimeFactory.processAllMessages();

            await quorumAcceptanceP;
            assert.strictEqual(quorum.get(expectedKey), expectedValue, "Wrong value in Quorum");
        });
    });

    describe("Connected state, multiple clients", () => {
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
            assert.ok(quorum2, "Could not create quorum2");
        });

        it("Can set a value and read it from all clients", async () => {
            const expectedKey = "key";
            const expectedValue = "value";
            const quorum1AcceptanceP = new Promise<void>((resolve) => {
                const watchForPending = (pendingKey: string): void => {
                    if (pendingKey === expectedKey) {
                        assert.strictEqual(
                            quorum1.getPending(expectedKey),
                            expectedValue,
                            "Value in Quorum 1 should be pending now",
                        );
                        assert.strictEqual(
                            quorum1.get(expectedKey),
                            undefined,
                            "Value in Quorum 1 should not be accepted yet",
                        );
                        quorum1.off("pending", watchForPending);

                        // Doing this synchronously after validating pending, since processAllMessages() won't permit
                        // us to pause after the set but before the noop.
                        const watchForAccepted = (acceptedKey: string): void => {
                            if (acceptedKey === expectedKey) {
                                assert.strictEqual(
                                    quorum1.getPending(expectedKey),
                                    undefined,
                                    "Value in Quorum 1 should not be pending anymore",
                                );
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
                const watchForPending = (pendingKey: string): void => {
                    if (pendingKey === expectedKey) {
                        assert.strictEqual(
                            quorum2.getPending(expectedKey),
                            expectedValue,
                            "Value in Quorum 2 should be pending now",
                        );
                        assert.strictEqual(
                            quorum2.get(expectedKey),
                            undefined,
                            "Value in Quorum 2 should not be accepted yet",
                        );
                        quorum2.off("pending", watchForPending);

                        // Doing this synchronously after validating pending, since processAllMessages() won't permit
                        // us to pause after the set but before the noop.
                        const watchForAccepted = (acceptedKey: string): void => {
                            if (acceptedKey === expectedKey) {
                                assert.strictEqual(
                                    quorum2.getPending(expectedKey),
                                    undefined,
                                    "Value in Quorum 2 should not be pending anymore",
                                );
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

    describe("Detached/Attach", () => {
        let containerRuntimeFactory: MockContainerRuntimeFactory;

        beforeEach(() => {
            containerRuntimeFactory = new MockContainerRuntimeFactory();
        });

        it("Can set and delete values before attaching and functions normally after attaching", async () => {
            // Create a detached Quorum.
            const dataStoreRuntime = new MockFluidDataStoreRuntime();
            const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);

            const quorum = new Quorum("quorum", dataStoreRuntime, QuorumFactory.Attributes);
            assert.strict(!quorum.isAttached(), "Quorum is attached earlier than expected");

            const accept1P = new Promise<void>((resolve) => {
                quorum.on("accepted", (key) => {
                    if (key === "baz") {
                        resolve();
                    }
                });
            });
            quorum.set("foo", "bar");
            quorum.set("baz", "boop");
            await accept1P;
            assert.strictEqual(quorum.get("baz"), "boop", "Couldn't set value in detached state");

            const accept2P = new Promise<void>((resolve) => {
                quorum.on("accepted", (key) => {
                    if (key === "foo") {
                        resolve();
                    }
                });
            });
            quorum.delete("foo");
            await accept2P;
            assert.strictEqual(quorum.get("foo"), undefined, "Couldn't delete value in detached state");

            // Attach the Quorum
            const services = {
                deltaConnection: containerRuntime.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            quorum.connect(services);

            assert.strict(quorum.isAttached(), "Quorum is not attached when expected");
            assert.strictEqual(quorum.get("foo"), undefined, "Wrong value in foo after attach");
            assert.strictEqual(quorum.get("baz"), "boop", "Wrong value in baz after attach");

            const accept3P = new Promise<void>((resolve) => {
                quorum.on("accepted", (key) => {
                    if (key === "woz") {
                        resolve();
                    }
                });
            });
            quorum.set("woz", "wiz");
            containerRuntimeFactory.processAllMessages();
            await accept3P;
            assert.strictEqual(quorum.get("woz"), "wiz", "Wrong value in woz after post-attach set");
        });
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
