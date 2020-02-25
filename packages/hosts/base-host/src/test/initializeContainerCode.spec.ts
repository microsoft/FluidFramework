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


class MockQuorum implements IQuorum, EventEmitter{

    private readonly map = new Map<string, any>();
    private readonly members: Map<string, ISequencedClient>;
    private readonly eventEmitter = new EventEmitter();

    constructor(... members: [string, Partial<ISequencedClient>][]) {
        this.members = new Map(members as [string, ISequencedClient][] ?? []);
    }

    async propose(key: string, value: any) {
        if (this.map.has(key)) {
            assert.fail(`${key} exists`);
        }
        this.map.set(key, value);
        this.eventEmitter.emit("approveProposal", 0, key, value);
        this.eventEmitter.emit("commitProposal", 0, key, value);
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

    addMember(id: string, client: ISequencedClient) {
        this.members.set(id, client);
        this.eventEmitter.emit("addMember");
    }

    removeMember(id: string) {
        if (this.members.delete(id)) {
            this.eventEmitter.emit("removeMember");
        }
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


    addListener(event: string | symbol, listener: (...args: any[]) => void): this {
        throw new Error("Method not implemented.");
    }
    on(event: string | symbol, listener: (...args: any[]) => void): this {
        switch (event) {
            case "afterOn":
                this.eventEmitter.on(event, listener);
                return this;

            case "addMember":
            case "removeMember":
            case "approveProposal":
            case "commitProposal":
                this.eventEmitter.on(event, listener);
                this.eventEmitter.emit("afterOn", event);
                return this;
            default:
                throw new Error("Method not implemented.");
        }
    }
    once(event: string | symbol, listener: (...args: any[]) => void): this {
        throw new Error("Method not implemented.");
    }
    prependListener(event: string | symbol, listener: (...args: any[]) => void): this {
        throw new Error("Method not implemented.");
    }
    prependOnceListener(event: string | symbol, listener: (...args: any[]) => void): this {
        throw new Error("Method not implemented.");
    }
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this {
        this.eventEmitter.removeListener(event, listener);
        return this;
    }
    off(event: string | symbol, listener: (...args: any[]) => void): this {
        throw new Error("Method not implemented.");
    }
    removeAllListeners(event?: string | symbol | undefined): this {
        throw new Error("Method not implemented.");
    }
    setMaxListeners(n: number): this {
        throw new Error("Method not implemented.");
    }
    getMaxListeners(): number {
        throw new Error("Method not implemented.");
    }
    listeners(event: string | symbol): Function[] {
        throw new Error("Method not implemented.");
    }
    rawListeners(event: string | symbol): Function[] {
        throw new Error("Method not implemented.");
    }
    emit(event: string | symbol, ...args: any[]): boolean {
        throw new Error("Method not implemented.");
    }
    eventNames(): (string | symbol)[] {
        throw new Error("Method not implemented.");
    }
    listenerCount(type: string | symbol): number {
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
