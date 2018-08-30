import { EventEmitter } from "events";
import * as api from "../../api-core";
import { IOrderer } from "../../core";

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

/**
 * Identifier for an ordering node in the system
 */
export interface INode {
    // Unique identifier for the node
    _id: string;

    // Address that the node can be reached at
    address: string;

    // Time when the node is set to expire
    expiration: number;
}

export interface IOpMessage {
    topic: string;
    op: string;
    data: any[];
}

export interface IConnectMessage {
    tenantId: string;
    documentId: string;
    user: api.ITenantUser;
    client: api.IClient;
}

export interface IConnectedMessage {
    clientId: string;
    existing: boolean;
    parentBranch: string;
}

export interface INodeMessage {
    // Connection identifier
    cid: number;

    // better way to do the before in TS?
    type: "order" | "op" | "connect" | "disconnect" | "connected";

    payload: api.IDocumentMessage | string | IOpMessage | IConnectMessage | IConnectedMessage;
}
