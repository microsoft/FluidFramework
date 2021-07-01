/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent } from "@fluidframework/common-definitions";
import { assert, TypedEventEmitter } from "@fluidframework/common-utils";
import { IQuorum, ISequencedClient } from "@fluidframework/protocol-definitions";

export const summarizerClientType = "summarizer";

/** Minimum information for a client tracked for election consideration. */
export interface ITrackedClient {
    readonly clientId: string;
    readonly sequenceNumber: number;
}

/** Additional information required for internal tracking of ineligible clients. */
interface IIneligibleClient extends ITrackedClient {
    readonly eligible: false;
    readonly isSummarizer: boolean;
}

/** Additional information required to keep track of the client within the doubly-linked list. */
interface IEligibleClient extends ITrackedClient {
    readonly eligible: true;
    olderClient: IEligibleClient;
    youngerClient: IEligibleClient | undefined;
}

type TrackedClient = IIneligibleClient | IEligibleClient;

interface IOrderedClientElectionEvents extends IEvent {
    /** Event fires when the currently elected client changes. */
    (event: "electedChange", listener: (client: ITrackedClient | undefined) => void);
    /** Event fires when the number of summarizers changes. */
    (event: "summarizerChange", listener: (summarizerCount: number) => void);
}

/**
 * Tracks clients in the Quorum. It maintains their order using their join op
 * sequence numbers. The purpose is to deterministically maintain a currently
 * elected client, excluding non-interactive clients, in a distributed fashion.
 * This can be true as long as incrementElectedClient and resetElectedClient calls
 * are called at the same time for all clients.
 * Internally, the collection of eligible (interactive, non-summarizer) clients is
 * maintained in a doubly-linked list, with pointers to both the first and last nodes.
 * The first node is a placeholder to simplify logic.
 */
export class OrderedClientElection extends TypedEventEmitter<IOrderedClientElectionEvents> {
    /** Collection of ALL clients currently in the quorum, with client ids as keys. */
    private readonly clientMap = new Map<string, TrackedClient>();
    /** Placeholder head node of linked list, for simplified null checking. */
    private readonly rootClient: IEligibleClient = {
        sequenceNumber: -1,
        clientId: "",
        eligible: true,
        get olderClient(): IEligibleClient {
            throw Error("Root client in OrderedClientElection should not have olderClient getter called.");
        },
        set olderClient(_: IEligibleClient) {
            throw Error("Root client in OrderedClientElection should not have olderClient setter called.");
        },
        youngerClient: undefined,
    };
    /** Pointer to end of linked list, for optimized client adds. */
    private youngestClient: IEligibleClient = this.rootClient;
    /** Count of clients eligible for election. */
    private eligibleCount = 0;
    /** Count of summarizer clients. */
    private summarizerCount = 0;
    /** Currently elected client (within linked list). */
    private electedClient: IEligibleClient | undefined;

    constructor(quorum: Pick<IQuorum, "getMembers" | "on">) {
        super();
        const members = quorum.getMembers();
        for (const [clientId, client] of members) {
            this.addClient(clientId, client);
        }

        quorum.on("addMember", this.addClient);
        quorum.on("removeMember", this.removeClient);

        this.resetElectedClient();
    }

    private insertEligibleClient(clientId: string, sequenceNumber: number): IEligibleClient {
        // Normal case is adding the latest client, which will bypass loop.
        // Find where it belongs otherwise (this shouldn't happen, assert?).
        assert(sequenceNumber > -1, 0x1f6 /* "Negative client sequence number not allowed" */);
        let currClient = this.youngestClient;
        while (currClient.sequenceNumber > sequenceNumber) {
            assert(currClient.olderClient !== undefined, 0x1f7 /* "Previous client should always be defined" */);
            // what to do if currClient === this.currentClient
            currClient = currClient.olderClient;
        }

        // Now currClient is the node right before where the new client node should be.
        const newClient: IEligibleClient = {
            clientId,
            sequenceNumber,
            eligible: true,
            olderClient: currClient,
            youngerClient: currClient.youngerClient,
        };

        // Update prev node to point to this new node.
        newClient.olderClient.youngerClient = newClient;

        if (newClient.youngerClient === undefined) {
            // Update linked list end pointer to youngest client.
            this.youngestClient = newClient;
        } else {
            // Update next node to point back to this new node.
            newClient.youngerClient.olderClient = newClient;
        }

        this.eligibleCount++;
        return newClient;
    }

    private deleteEligibleClient(removeClient: Readonly<IEligibleClient>) {
        // Update prev node to point to next node.
        removeClient.olderClient.youngerClient = removeClient.youngerClient;

        if (removeClient.youngerClient === undefined) {
            // Update linked list end pointer to youngest client.
            this.youngestClient = removeClient.olderClient;
        } else {
            // Update next node to point back to previous node.
            removeClient.youngerClient.olderClient = removeClient.olderClient;
        }

        this.eligibleCount--;
    }

    private readonly addClient = (clientId: string, client: ISequencedClient) => {
        const isSummarizer = client.client.details?.type === summarizerClientType;
        const eligible = !isSummarizer && (client.client.details?.capabilities.interactive ?? true);
        const newClient: TrackedClient = eligible ? this.insertEligibleClient(clientId, client.sequenceNumber) : {
            clientId,
            sequenceNumber: client.sequenceNumber,
            eligible,
            isSummarizer,
        };
        this.clientMap.set(clientId, newClient);

        // Emit change events if necessary
        if (newClient.eligible) {
            if (this.electedClient === undefined && newClient.youngerClient === undefined) {
                this.electedClient = newClient;
                this.emit("electedChange", this.getElectedClient());
            }
        } else {
            if (newClient.isSummarizer) {
                this.summarizerCount++;
                this.emit("summarizerChange", this.summarizerCount);
            }
        }
    };

    private readonly removeClient = (clientId: string) => {
        const removeClient = this.clientMap.get(clientId);
        if (removeClient !== undefined) {
            this.clientMap.delete(clientId);
            if (!removeClient.eligible) {
                if (removeClient.isSummarizer) {
                    this.summarizerCount--;
                    this.emit("summarizerChange", this.summarizerCount);
                }
                return;
            }

            this.deleteEligibleClient(removeClient);
            if (removeClient === this.electedClient) {
                this.electedClient = this.electedClient.youngerClient;
                this.emit("electedChange", this.getElectedClient());
            }
        }
    };

    /** Returns the currently elected client. */
    public getElectedClient(): ITrackedClient | undefined {
        return this.electedClient;
    }

    /** Resets the currently elected client back to its original value: the oldest eligible client. */
    public resetElectedClient(): void {
        const prevId = this.electedClient?.clientId;
        this.electedClient = this.rootClient.youngerClient;
        if (prevId !== this.electedClient?.clientId) {
            this.emit("electedChange", this.getElectedClient());
        }
    }

    /** Increments the currently elected client to the next oldest eligible client. */
    public incrementElectedClient(): void {
        const prevId = this.electedClient?.clientId;
        this.electedClient = this.electedClient?.youngerClient;
        if (prevId !== this.electedClient?.clientId) {
            this.emit("electedChange", this.getElectedClient());
        }
    }

    /** Returns the count of eligible clients tracked. Eligible clients must be interactive, non-summarizers. */
    public getEligibleCount(): number {
        return this.eligibleCount;
    }

    /** Returns the count of summarizer clients tracked. */
    public getSummarizerCount(): number {
        return this.summarizerCount;
    }

    /** Returns the total count of clients tracked. */
    public getTotalCount(): number {
        return this.clientMap.size;
    }

    /** Returns an array of all eligible client ids being tracked in order from oldest to newest. */
    public getOrderedEligibleClientIds(): string[] {
        const result: string[] = [];
        let currClient = this.rootClient;
        while (currClient.youngerClient !== undefined) {
            result.push(currClient.youngerClient.clientId);
            currClient = currClient.youngerClient;
        }
        return result;
    }
}
