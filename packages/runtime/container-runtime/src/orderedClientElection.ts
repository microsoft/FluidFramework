/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent, IEventProvider, ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, TypedEventEmitter } from "@fluidframework/common-utils";
import { IDeltaManager } from "@fluidframework/container-definitions";
import { IClient, IQuorumClients, ISequencedClient } from "@fluidframework/protocol-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";

// helper types for recursive readonly.
// eslint-disable-next-line @typescript-eslint/ban-types
export type ImmutablePrimitives = undefined | null | boolean | string | number | Function;
export type Immutable<T> = T extends ImmutablePrimitives
    ? T
    : T extends (infer A)[]
    ? readonly Immutable<A>[]
    : T extends Map<infer K, infer V>
    ? ReadonlyMap<Immutable<K>, Immutable<V>>
    : T extends Set<infer V>
    ? ReadonlySet<Immutable<V>>
    : { readonly [K in keyof T]: Immutable<T[K]> };

/** Minimum information for a client tracked for election consideration. */
export interface ITrackedClient {
    readonly clientId: string;
    readonly sequenceNumber: number;
    readonly client: Immutable<IClient>;
}

/** Common contract for link nodes within an OrderedClientCollection. */
export interface ILinkNode {
    readonly sequenceNumber: number;
    youngerClient: ILinkedClient | undefined;
}

/** Placeholder root node within an OrderedClientCollection; does not represent a client. */
export interface IRootLinkNode extends ILinkNode {
    readonly sequenceNumber: -1;
    readonly olderClient: undefined;
}

/** Additional information required to keep track of the client within the doubly-linked list. */
export interface ILinkedClient extends ILinkNode, ITrackedClient {
    olderClient: LinkNode;
}

/** Any link node within OrderedClientCollection including the placeholder root node. */
export type LinkNode = IRootLinkNode | ILinkedClient;

/** Events raised by an OrderedClientCollection. */
export interface IOrderedClientCollectionEvents extends IEvent {
    /** Event fires when client is being added. */
    (event: "addClient" | "removeClient", listener: (client: ILinkedClient, sequenceNumber: number) => void);
}

/** Contract for a sorted collection of all clients in the quorum. */
export interface IOrderedClientCollection extends IEventProvider<IOrderedClientCollectionEvents> {
    /** Count of clients in the collection. */
    readonly count: number;
    /** Pointer to the oldest client in the collection. */
    readonly oldestClient: ILinkedClient | undefined;
    /** Returns a sorted array of all the clients in the collection. */
    getAllClients(): ILinkedClient[];
}

/**
 * Tracks clients in the Quorum. It maintains their order using their join op
 * sequence numbers.
 * Internally, the collection of clients is maintained in a doubly-linked list,
 * with pointers to both the first and last nodes.
 * The first (root) node is a placeholder to simplify logic and reduce null checking.
 */
export class OrderedClientCollection
    extends TypedEventEmitter<IOrderedClientCollectionEvents>
    implements IOrderedClientCollection {
    /** Collection of ALL clients currently in the quorum, with client ids as keys. */
    private readonly clientMap = new Map<string, ILinkedClient>();
    /** Placeholder head node of linked list, for simplified null checking. */
    private readonly rootNode: IRootLinkNode = {
        sequenceNumber: -1,
        olderClient: undefined,
        youngerClient: undefined,
    };
    /** Pointer to end of linked list, for optimized client adds. */
    private _youngestClient: LinkNode = this.rootNode;
    private readonly logger: ITelemetryLogger;

    public get count() {
        return this.clientMap.size;
    }
    public get oldestClient() {
        return this.rootNode.youngerClient;
    }

    constructor(
        logger: ITelemetryLogger,
        deltaManager: Pick<IDeltaManager<unknown, unknown>, "lastSequenceNumber">,
        quorum: Pick<IQuorumClients, "getMembers" | "on">,
    ) {
        super();
        this.logger = ChildLogger.create(logger, "OrderedClientCollection");
        const members = quorum.getMembers();
        for (const [clientId, client] of members) {
            this.addClient(clientId, client);
        }

        quorum.on("addMember", (clientId, client) => {
            const newClient = this.addClient(clientId, client);
            this.emit("addClient", newClient, deltaManager.lastSequenceNumber);
        });
        quorum.on("removeMember", (clientId) => {
            const sequenceNumber = deltaManager.lastSequenceNumber;
            const removeClient = this.removeClient(clientId);
            if (removeClient === undefined) {
                this.logger.sendErrorEvent({ eventName: "ClientNotFound", clientId, sequenceNumber });
            } else {
                this.emit("removeClient", removeClient, sequenceNumber);
            }
        });
    }

    private addClient(clientId: string, client: ISequencedClient): ITrackedClient {
        // Normal case is adding the latest client, which will bypass loop.
        // Find where it belongs otherwise (maybe possible during initial load?).
        assert(client.sequenceNumber > -1, 0x1f6 /* "Negative client sequence number not allowed" */);
        let currClient = this._youngestClient;
        while (currClient.sequenceNumber > client.sequenceNumber) {
            assert(currClient.olderClient !== undefined, 0x1f7 /* "Previous client should always be defined" */);
            // Note: If adding a client older than the elected client, it will not be automatically elected.
            currClient = currClient.olderClient;
        }

        // Now currClient is the node right before where the new client node should be.
        const newClient: ILinkedClient = {
            clientId,
            sequenceNumber: client.sequenceNumber,
            client: { ...client.client }, // shallow clone
            olderClient: currClient,
            youngerClient: currClient.youngerClient,
        };

        // Update prev node to point to this new node.
        newClient.olderClient.youngerClient = newClient;

        if (newClient.youngerClient === undefined) {
            // Update linked list end pointer to youngest client.
            this._youngestClient = newClient;
        } else {
            // Update next node to point back to this new node.
            newClient.youngerClient.olderClient = newClient;
        }

        this.clientMap.set(clientId, newClient);
        return newClient;
    }

    private removeClient(clientId: string): ITrackedClient | undefined {
        const removeClient = this.clientMap.get(clientId);
        if (removeClient === undefined) {
            return;
        }

        // Update prev node to point to next node.
        removeClient.olderClient.youngerClient = removeClient.youngerClient;

        if (removeClient.youngerClient === undefined) {
            // Update linked list end pointer to youngest client.
            this._youngestClient = removeClient.olderClient;
        } else {
            // Update next node to point back to previous node.
            removeClient.youngerClient.olderClient = removeClient.olderClient;
        }

        this.clientMap.delete(clientId);
        return removeClient;
    }

    /** Returns an array of all clients being tracked in order from oldest to newest. */
    public getAllClients(): ILinkedClient[] {
        const result: ILinkedClient[] = [];
        let currClient: LinkNode = this.rootNode;
        while (currClient.youngerClient !== undefined) {
            result.push(currClient.youngerClient);
            currClient = currClient.youngerClient;
        }
        return result;
    }
}

/** Events raised by an OrderedClientElection. */
export interface IOrderedClientElectionEvents extends IEvent {
    /** Event fires when the currently elected client changes. */
    (event: "election", listener: (
        /** Newly elected client. */
        client: ITrackedClient | undefined,
        /** Sequence number where election took place. */
        sequenceNumber: number,
        /** Previously elected client. */
        prevClient: ITrackedClient | undefined,
    ) => void);
}

/** Serialized state of IOrderedClientElection. */
export interface ISerializedElection {
    /** Sequence number at the time of the latest election. */
    readonly electionSequenceNumber: number;
    /** Most recently elected client id. */
    readonly electedClientId: string | undefined;
}

/** Contract for maintaining a deterministic client election based on eligibility. */
export interface IOrderedClientElection extends IEventProvider<IOrderedClientElectionEvents> {
    /** Count of eligible clients in the collection. */
    readonly eligibleCount: number;
    /** Currently elected client. */
    readonly electedClient: ITrackedClient | undefined;
    /** Sequence number of most recent election. */
    readonly electionSequenceNumber: number;
    /** Marks the currently elected client as invalid, and elects the next eligible client. */
    incrementElectedClient(sequenceNumber: number): void;
    /** Resets the currently elected client back to the oldest eligible client. */
    resetElectedClient(sequenceNumber: number): void;
    /** Peeks at what the next elected client would be if incrementElectedClient were called. */
    peekNextElectedClient(): ITrackedClient | undefined;
    /** Returns a sorted array of all the eligible clients in the collection. */
    getAllEligibleClients(): ITrackedClient[];
    /** Serialize election data */
    serialize(): ISerializedElection;
}

/**
 * Adapter for OrderedClientCollection, with the purpose of deterministically maintaining
 * a currently elected client, excluding ineligible clients, in a distributed fashion.
 * This can be true as long as incrementElectedClient and resetElectedClient calls
 * are called under the same conditions for all clients.
 */
export class OrderedClientElection
    extends TypedEventEmitter<IOrderedClientElectionEvents>
    implements IOrderedClientElection {
    private _eligibleCount: number = 0;
    private _electedClient: ILinkedClient | undefined;
    private _electionSequenceNumber: number;

    public get eligibleCount() {
        return this._eligibleCount;
    }
    public get electedClient() {
        return this._electedClient;
    }
    public get electionSequenceNumber() {
        return this._electionSequenceNumber;
    }

    constructor(
        logger: ITelemetryLogger,
        private readonly orderedClientCollection: IOrderedClientCollection,
        /** Serialized state from summary or current sequence number at time of load if new. */
        initialState: ISerializedElection | number,
        private readonly isEligibleFn: (c: ITrackedClient) => boolean,
    ) {
        super();
        let initialClient: ILinkedClient | undefined;
        for (const client of orderedClientCollection.getAllClients()) {
            this.addClient(client, 0);
            if (typeof initialState !== "number") {
                if (client.clientId === initialState.electedClientId) {
                    initialClient = client;
                }
            }
        }
        orderedClientCollection.on("addClient", (client, seq) => this.addClient(client, seq));
        orderedClientCollection.on("removeClient", (client, seq) => this.removeClient(client, seq));

        if (typeof initialState === "number") {
            this._electionSequenceNumber = initialState;
        } else {
            // Override the initially elected client with the initial state.
            if (initialClient?.clientId !== initialState.electedClientId) {
                // Cannot find initially elected client, so elect undefined.
                logger.sendErrorEvent({
                    eventName: "InitialElectedClientNotFound",
                    electionSequenceNumber: initialState.electionSequenceNumber,
                    expectedClientId: initialState.electedClientId,
                    electedClientId: initialClient?.clientId,
                    clientCount: orderedClientCollection.count,
                });
            } else if (initialClient !== undefined && !isEligibleFn(initialClient)) {
                // Initially elected client is ineligible, so elect next eligible client.
                initialClient = this.findFirstEligibleClient(initialClient);
                logger.sendErrorEvent({
                    eventName: "InitialElectedClientIneligible",
                    electionSequenceNumber: initialState.electionSequenceNumber,
                    expectedClientId: initialState.electedClientId,
                    electedClientId: initialClient?.clientId,
                });
            }
            this._electedClient = initialClient;
            this._electionSequenceNumber = initialState.electionSequenceNumber;
        }
    }

    /** Tries changing the elected client, raising an event if it is different. */
    private tryElectingClient(client: ILinkedClient | undefined, sequenceNumber: number): void {
        this._electionSequenceNumber = sequenceNumber;
        if (this._electedClient === client) {
            return;
        }
        const prevClient = this._electedClient;
        this._electedClient = client;
        this.emit("election", client, sequenceNumber, prevClient);
    }

    /**
     * Helper function to find the first eligible client starting with the passed in client,
     * or undefined if none are eligible.
     * @param client - client to start checking
     * @returns oldest eligible client starting with passed in client or undefined if none.
     */
    private findFirstEligibleClient(client: ILinkedClient | undefined): ILinkedClient | undefined {
        let candidateClient = client;
        while (candidateClient !== undefined && !this.isEligibleFn(candidateClient)) {
            candidateClient = candidateClient.youngerClient;
        }
        return candidateClient;
    }

    /**
     * Updates tracking for when a new client is added to the collection.
     * Will automatically elect that new client if none is elected currently.
     * @param client - client added to the collection
     * @param sequenceNumber - sequence number when client was added
     */
    private addClient(client: ILinkedClient, sequenceNumber: number): void {
        if (this.isEligibleFn(client)) {
            this._eligibleCount++;
            if (this._electedClient === undefined) {
                // Automatically elect latest client
                this.tryElectingClient(client, sequenceNumber);
            }
        }
    }

    /**
     * Updates tracking for when an existing client is removed from the collection.
     * Will automatically elect next oldest client if currently elected is removed.
     * @param client - client removed from the collection
     * @param sequenceNumber - sequence number when client was removed
     */
    private removeClient(client: ILinkedClient, sequenceNumber: number): void {
        if (this.isEligibleFn(client)) {
            this._eligibleCount--;
            if (this._electedClient === client) {
                // Automatically shift to next oldest client
                const nextClient = this.findFirstEligibleClient(this._electedClient.youngerClient);
                this.tryElectingClient(nextClient, sequenceNumber);
            }
        }
    }

    public getAllEligibleClients(): ITrackedClient[] {
        return this.orderedClientCollection.getAllClients().filter(this.isEligibleFn);
    }

    public incrementElectedClient(sequenceNumber: number): void {
        const nextClient = this.findFirstEligibleClient(this._electedClient?.youngerClient);
        this.tryElectingClient(nextClient, sequenceNumber);
    }

    public resetElectedClient(sequenceNumber: number): void {
        const firstClient = this.findFirstEligibleClient(this.orderedClientCollection.oldestClient);
        this.tryElectingClient(firstClient, sequenceNumber);
    }

    public peekNextElectedClient(): ITrackedClient | undefined {
        return this.findFirstEligibleClient(this._electedClient?.youngerClient);
    }

    public serialize(): ISerializedElection {
        return {
            electionSequenceNumber: this.electionSequenceNumber,
            electedClientId: this.electedClient?.clientId,
        };
    }
}
