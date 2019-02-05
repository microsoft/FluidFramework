import { IClient, IDocumentMessage } from "@prague/container-definitions";
import { IOrderer } from "@prague/services-core";
import { EventEmitter } from "events";

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
}

export interface INodeMessage {
    // Connection identifier
    cid: number;

    // better way to do the before in TS?
    type: "order" | "op" | "connect" | "disconnect" | "connected";

    payload: IDocumentMessage | string | IOpMessage | IConnectMessage | IConnectedMessage;
}
