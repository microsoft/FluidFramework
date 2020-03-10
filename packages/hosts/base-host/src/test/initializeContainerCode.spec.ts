/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/consistent-type-assertions */

import * as assert from "assert";
import { Container } from "@microsoft/fluid-container-loader";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { MockQuorum } from "@microsoft/fluid-test-runtime-utils";
// eslint-disable-next-line import/no-extraneous-dependencies
import { IQuorum } from "@microsoft/fluid-protocol-definitions";
import { initializeContainerCode } from "../initializeContainerCode";

const codePkg = {} as IFluidCodeDetails;

describe("base-host", () => {
    describe("initializeContainerCode", () => {
        it("Quorum has pre-existing proposal", async () => {
            const quorum = new MockQuorum() as unknown as IQuorum;
            await quorum.propose("code", codePkg);
            const containter: Partial<Container> = {
                getQuorum: () => quorum,
            };
            await initializeContainerCode(containter as Container, codePkg);
            assert(quorum.has("code"), "quorum missing code proposal");
        });
        describe("Non-existent Container", () => {
            it("Not Connected", async () => {
                const quorum = new MockQuorum() as unknown as IQuorum;
                const containter: Partial<Container> = {
                    getQuorum: () => quorum,
                    existing: false,
                    connected: false,
                    once: (event, listener) => {
                        switch (event) {
                            case "connected":
                            case "contextChanged":
                                break;
                            default:
                                assert.fail(`Didn't expect ${String(event)}`);
                        }
                        listener(event);
                        return containter as Container;
                    },
                };
                await initializeContainerCode(containter as Container, codePkg);
                assert(quorum.has("code"), "quorum missing code proposal");
            });
            it("Connected", async () => {
                const quorum = new MockQuorum() as unknown as IQuorum;
                const containter: Partial<Container> = {
                    getQuorum: () => quorum,
                    existing: false,
                    connected: true,
                    once: (event, listener) => {
                        switch (event) {
                            case "connected":
                            case "contextChanged":
                                break;
                            default:
                                assert.fail(`Didn't expect ${String(event)}`);
                        }
                        listener(event);
                        return containter as Container;
                    },
                };
                await initializeContainerCode(containter as Container, codePkg);
                assert(quorum.has("code"), "quorum missing code proposal");
            });
        });

        describe("Existing Container ", () => {
            it("First in quorum", async () => {
                const quorum = new MockQuorum(["2", { sequenceNumber: 2 }]) as unknown as IQuorum;

                const containter: Partial<Container> = {
                    getQuorum: () => quorum,
                    existing: true,
                    connected: true,
                    clientId: "2",
                    once: (event, listener) => {
                        switch (event) {
                            case "contextChanged":
                                break;
                            default:
                                assert.fail(`Didn't expect ${String(event)}`);
                        }
                        listener(event);
                        return containter as Container;
                    },
                };
                await initializeContainerCode(containter as Container, codePkg);
                assert(quorum.has("code"), "quorum missing code proposal");
            });

            it("First in quorum leaves", async () => {
                const quorum = new MockQuorum(
                    ["1", { sequenceNumber: 1 }],
                    ["2", { sequenceNumber: 2 }],
                );
                quorum.on("afterOn", (event) => {
                    if (event === "removeMember") {
                        quorum.removeMember("1");
                    }
                });
                const containter: Partial<Container> = {
                    getQuorum: () => quorum,
                    existing: true,
                    connected: true,
                    clientId: "2",
                    once: (event, listener) => {
                        switch (event) {
                            case "contextChanged":
                                break;
                            default:
                                assert.fail(`Didn't expect ${String(event)}`);
                        }
                        listener(event);
                        return containter as Container;
                    },
                };
                await initializeContainerCode(containter as Container, codePkg);
                assert(quorum.has("code"), "quorum missing code proposal");
            });

            describe("Not Connected", () => {
                it("Proposal shows up", async () => {
                    const quorum = new MockQuorum() as unknown as IQuorum;
                    const containter: Partial<Container> = {
                        getQuorum: () => quorum,
                        existing: true,
                        connected: false,
                        once: (event, listener) => {
                            switch (event) {
                                case "contextChanged":
                                    break;
                                case "connected":
                                    // propose the code when they are waiting on the connected event
                                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                                    quorum.propose("code", codePkg);
                                    break;
                                default:
                                    assert.fail(`Didn't expect ${String(event)}`);
                            }
                            listener(event);
                            return containter as Container;
                        },
                    };
                    await initializeContainerCode(containter as Container, codePkg);
                    assert(quorum.has("code"), "quorum missing code proposal");
                });
            });
        });
    });
});
