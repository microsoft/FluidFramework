/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent } from "@fluidframework/common-definitions";
import { assert, TypedEventEmitter } from "@fluidframework/common-utils";
import { IQuorum, ISequencedClient } from "@fluidframework/protocol-definitions";

export const summarizerClientType = "summarizer";

interface ISequencedComparable {
    readonly sequenceNumber: number;
}

interface ILinkedClient extends ISequencedComparable {
    readonly clientId: string;
    prevClient: ILinkedClient | undefined;
    nextClient: ILinkedClient | undefined;
}

interface ITrackedClient extends ILinkedClient {
    readonly isSummarizer: boolean;
}

interface IOrderedClientsEvents extends IEvent {
    (event: "currentChange", listener: (currentClientId: string | undefined) => void);
    (event: "summarizerChange", listener: (summarizerCount: number) => void);
}

export class OrderedClients extends TypedEventEmitter<IOrderedClientsEvents> {
    private readonly clientMap = new Map<string, ITrackedClient>();
    private readonly rootClient: ILinkedClient = {
        sequenceNumber: -1,
        clientId: "",
        prevClient: undefined,
        nextClient: undefined,
    };
    private lastClient: ILinkedClient = this.rootClient;
    private nonSummarizerCount = 0;
    private summarizerCount = 0;
    private currentClient: ILinkedClient | undefined;

    constructor(quorum: Pick<IQuorum, "getMembers" | "on">) {
        super();
        const members = quorum.getMembers();
        for (const [clientId, client] of members) {
            this.addClient(clientId, client);
        }

        quorum.on("addMember", this.addClient);
        quorum.on("removeMember", this.removeClient);

        this.resetCurrentClient();
    }

    private readonly addClient = (clientId: string, client: ISequencedClient) => {
        // Have to undefined-check client.details for backwards compatibility
        const isSummarizer = client.client.details?.type === summarizerClientType;
        const newClient: ITrackedClient = {
            clientId,
            sequenceNumber: client.sequenceNumber,
            isSummarizer,
            prevClient: undefined,
            nextClient: undefined,
        };
        this.clientMap.set(clientId, newClient);

        if (newClient.isSummarizer) {
            this.summarizerCount++;
            this.emit("summarizerChange", this.summarizerCount);
            return;
        }

        // Normal case is adding the latest client, which will bypass loop.
        // Find where it belongs otherwise (this shouldn't happen, assert?).
        assert(newClient.sequenceNumber > -1, "Negative sequence number not allowed");
        let currClient = this.lastClient;
        while (currClient.sequenceNumber > newClient.sequenceNumber) {
            assert(currClient.prevClient !== undefined, "Previous client should always be defined");
            // what to do if currClient === this.currentClient
            currClient = currClient.prevClient;
        }
        // Now currClient is the node right before where the new client node should be.
        newClient.prevClient = currClient;
        newClient.nextClient = currClient.nextClient;
        newClient.prevClient.nextClient = newClient;
        if (newClient.nextClient === undefined) {
            this.lastClient = newClient;
        } else {
            newClient.nextClient.prevClient = newClient;
        }

        if (this.currentClient === undefined && newClient.nextClient === undefined) {
            this.currentClient = newClient;
            this.emit("currentChange", this.getCurrentClientId());
        }
        this.nonSummarizerCount++;
    };

    private readonly removeClient = (clientId: string) => {
        const removeClient = this.clientMap.get(clientId);
        if (removeClient !== undefined) {
            this.clientMap.delete(clientId);
            if (removeClient.isSummarizer) {
                this.summarizerCount--;
                this.emit("summarizerChange", this.summarizerCount);
                return;
            }

            assert(removeClient.prevClient !== undefined, "Always should have prevClient");
            removeClient.prevClient.nextClient = removeClient.nextClient;
            if (removeClient.nextClient === undefined) {
                this.lastClient = removeClient.prevClient;
            } else {
                removeClient.nextClient.prevClient = removeClient.prevClient;
            }

            if (removeClient === this.currentClient) {
                this.currentClient = this.currentClient.nextClient;
                this.emit("currentChange", this.getCurrentClientId());
            }
            this.nonSummarizerCount--;
        }
    };

    public getCurrentClientId(): string | undefined {
        return this.currentClient?.clientId;
    }

    public resetCurrentClient(): void {
        const prevId = this.currentClient?.clientId;
        this.currentClient = this.rootClient.nextClient;
        if (prevId !== this.currentClient?.clientId) {
            this.emit("currentChange", this.currentClient?.clientId);
        }
    }

    public incrementCurrentClient(): void {
        const prevId = this.currentClient?.clientId;
        this.currentClient = this.currentClient?.nextClient;
        if (prevId !== this.currentClient?.clientId) {
            this.emit("currentChange", this.currentClient?.clientId);
        }
    }

    public getNonSummarizerCount(): number {
        return this.nonSummarizerCount;
    }

    public getSummarizerCount(): number {
        return this.summarizerCount;
    }

    public getTotalCount(): number {
        return this.clientMap.size;
    }

    public getOrderedNonSummarizerClientIds(): string[] {
        const result: string[] = [];
        let currClient = this.rootClient;
        while (currClient.nextClient !== undefined) {
            result.push(currClient.nextClient.clientId);
            currClient = currClient.nextClient;
        }
        return result;
    }
}

/**
 * Used to give increasing delay times for throttling a single functionality.
 * Delay is based on previous attempts within specified time window, ignoring actual delay time.
 */
 export class Throttler {
    private startTimes: number[] = [];
    constructor(
        private readonly delayWindowMs: number,
        private readonly maxDelayMs: number,
        private readonly delayFunction: (n: number) => number,
    ) { }

    public get attempts() {
        return this.startTimes.length;
    }

    public getDelay() {
        const now = Date.now();
        this.startTimes = this.startTimes.filter((t) => now - t < this.delayWindowMs);
        const delayMs = Math.min(this.delayFunction(this.startTimes.length), this.maxDelayMs);
        this.startTimes.push(now);
        this.startTimes = this.startTimes.map((t) => t + delayMs); // account for delay time
        if (delayMs === this.maxDelayMs) {
            // we hit max delay so adding more won't affect anything
            // shift off oldest time to stop this array from growing forever
            this.startTimes.shift();
        }

        return delayMs;
    }
}
