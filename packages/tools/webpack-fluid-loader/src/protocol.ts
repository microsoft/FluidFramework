/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IAudienceOwner } from "@fluidframework/container-definitions";
import { IProtocolHandler, ProtocolHandlerBuilder } from "@fluidframework/container-loader";
import { IQuorumSnapshot, IScribeProtocolState } from "@fluidframework/protocol-base";
import {
    IQuorum,
    IDocumentAttributes,
    ISequencedDocumentMessage,
    IProcessMessageResult,
    ISignalMessage,
    IClient,
    IQuorumEvents,
    ISequencedClient,
} from "@fluidframework/protocol-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";

class EmptyAudience extends EventEmitter implements IAudienceOwner {
    getMembers(): Map<string, IClient> {
        return new Map<string, IClient>();
    }

    getMember(_clientId: string): IClient | undefined {
        return undefined;
    }

    removeMember(_clientId: string): boolean {
        return true;
    }

    addMember(_clientId: string, _details: IClient) {}
    clear() {}
}

class LocalQuorum extends TypedEventEmitter<IQuorumEvents> implements IQuorum {
    disposed: boolean = false;
    private static readonly noClientId = "local";

    private readonly proposals = new Map<string, any>();
    private clientId: string = LocalQuorum.noClientId;

    constructor(quorumSnapshot: IQuorumSnapshot) {
        super();

        for (const pair of quorumSnapshot.values) {
            const proposal = pair[1];
            this.proposals.set(proposal.key, proposal.value);
        }
    }

    connectLocalClient(clientId: string | undefined, sequenceNumber: number) {
        this.clientId = clientId ?? LocalQuorum.noClientId;
        this.emit(
            "addMember",
            clientId,
            { sequenceNumber, client: { details: { type: "local" } } },
        );
    }

    disconnectLocalClient(clientId: string | undefined) {
        if (this.clientId === clientId) {
            this.emit("removeMember", clientId);
        }
    }

    getMembers(): Map<string, ISequencedClient> {
        return new Map<string, ISequencedClient>();
    }

    getMember(_clientId: string): ISequencedClient | undefined {
        return undefined;
    }

    dispose(_error?: Error | undefined): void {
        this.disposed = true;
    }

    async propose(key: string, value: any): Promise<void> {
        this.proposals.set(key, value);
        return new Promise<void>(() => {});
    }

    has(key: string): boolean {
        return this.proposals.get(key) !== undefined;
    }

    get(key: string): any {
        return this.proposals.get(key);
    }
}

class EmptyProtocolHandler implements IProtocolHandler {
    constructor(
        public readonly audience: IAudienceOwner,
        public readonly quorum: LocalQuorum,
        public readonly attributes: IDocumentAttributes,
        public readonly initialSnapshot: IQuorumSnapshot,
    ) { }

    public snapshot(): IQuorumSnapshot {
        return this.initialSnapshot;
    }

    processMessage(_message: ISequencedDocumentMessage, _local: boolean): IProcessMessageResult {
        return {};
    }

    getProtocolState(): IScribeProtocolState {
        return {
            sequenceNumber: this.attributes.sequenceNumber,
            minimumSequenceNumber: this.attributes.minimumSequenceNumber,
            members: [],
            proposals: [],
            values: [],
        };
    }

    setConnectionState(connected: boolean, clientId: string | undefined) {
        if (connected) {
            this.quorum.connectLocalClient(clientId, this.attributes.sequenceNumber);
        } else {
            this.quorum.disconnectLocalClient(clientId);
        }
    }

    close(): void {}
    processSignal(_message: ISignalMessage) {}
}

export const emptyProtocolHandlerBuilder: ProtocolHandlerBuilder = (
    attributes: IDocumentAttributes,
    snapshot: IQuorumSnapshot,
): IProtocolHandler => new EmptyProtocolHandler(
    new EmptyAudience(),
    new LocalQuorum(snapshot),
    attributes,
    snapshot);
