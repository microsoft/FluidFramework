/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IClient, IDocumentMessage, IServiceConfiguration } from "@microsoft/fluid-protocol-definitions";
import {
    ICollection,
    IContext,
    IDocument,
    IDocumentDetails,
    IKafkaMessage,
    IOrderer,
    ISequencedOperationMessage,
} from "@microsoft/fluid-server-services-core";

export interface IConcreteNode extends EventEmitter {
    id: string;

    valid: boolean;

    connectOrderer(tenantId: string, documentId: string): Promise<IOrderer>;
}

export interface IReservationManager {
    /**
     * Retrieves an existing reservation
     */
    getOrReserve(key: string, node: IConcreteNode): Promise<IConcreteNode>;
}

export interface IConcreteNodeFactory {
    create(): Promise<IConcreteNode>;
}

export interface IOpMessage {
    topic: string;
    op: string;
    data: any[];
}

export interface IConnectMessage {
    tenantId: string;
    documentId: string;
    client: IClient;
}

export interface IConnectedMessage {
    clientId: string;
    existing: boolean;
    parentBranch: string;
    maxMessageSize: number;
    serviceConfiguration: IServiceConfiguration;
}

export interface INodeMessage {
    // Connection identifier
    cid: number;

    // Better way to do the before in TS?
    type: "order" | "op" | "connect" | "disconnect" | "connected";

    payload: IDocumentMessage | string | IOpMessage | IConnectMessage | IConnectedMessage;
}

export interface ILocalOrdererSetup {
    documentP(): Promise<IDocumentDetails>;
    documentCollectionP(): Promise<ICollection<IDocument>>;
    deltaCollectionP(): Promise<ICollection<any>>;
    scribeDeltaCollectionP(): Promise<ICollection<ISequencedOperationMessage>>;
    protocolHeadP(): Promise<number>;
    scribeMessagesP(): Promise<ISequencedOperationMessage[]>;
}

export interface IKafkaSubscriber {
    readonly context: IContext;

    process(message: IKafkaMessage): void;
}
