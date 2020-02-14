/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable @typescript-eslint/consistent-type-assertions */

import * as assert from "assert";
import { EventEmitter } from "events";
import { Container } from "@microsoft/fluid-container-loader";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
// eslint-disable-next-line import/no-extraneous-dependencies
import { ICommittedProposal, IQuorum, ISequencedClient } from "@microsoft/fluid-protocol-definitions";
import { initializeContainerCode } from "../initializeContainerCode";

const codePkg = {} as IFluidCodeDetails;


class MockQuorum extends EventEmitter implements IQuorum{

    private readonly map = new Map<string, any>();
    private readonly members: Map<string, ISequencedClient>;


    constructor(... members: [string, Partial<ISequencedClient>][]) {
        super();
        this.members = new Map(members as [string, ISequencedClient][] ?? []);
    }

    async propose(key: string, value: any) {
        if (this.map.has(key)) {
            assert.fail(`${key} exists`);
        }
        this.map.set(key, value);
        this.emit("approveProposal", 0, key, value);
        this.emit("commitProposal", 0, key, value);
    }
    has(key: string): boolean {
        return this.map.has(key);
    }
    get(key: string) {
        return this.map.get(key);
    }
    getApprovalData(key: string): ICommittedProposal | undefined {
        throw new Error("Method not implemented.");
    }
    getMembers(): Map<string, ISequencedClient> {
        return this.members;
    }
    getMember(clientId: string): ISequencedClient | undefined {
        return this.getMembers().get(clientId);
    }
    disposed: boolean = false;

    dispose(): void {
        throw new Error("Method not implemented.");
    }
}

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

        it("Non-existent Container", async () => {
            const quorum = new MockQuorum() as unknown as IQuorum;
            const containter: Partial<Container> = {
                getQuorum: () => quorum,
                existing: false,
                once: (event, listener) => {
                    listener(event);
                    return containter as Container;
                },
            };
            await initializeContainerCode(containter as Container, codePkg);
            assert(quorum.has("code"), "quorum missing code proposal");
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
                ) as unknown as IQuorum;
                const containter: Partial<Container> = {
                    getQuorum: () => quorum,
                    existing: true,
                    connected: true,
                    clientId: "2",
                    once: (event, listener) => {
                        switch (event) {
                            case "contextChanged":
                                break;
                            case "removeMember":
                                quorum.getMembers().delete("1");
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
