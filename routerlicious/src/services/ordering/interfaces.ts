import { EventEmitter } from "events";
import { IOrderer, IOrdererSocket, IRawOperationMessage } from "../../core";

export interface ISocketOrderer extends IOrderer {
    attachSocket(socket: IOrdererSocket);
}

export interface IConcreteNode extends EventEmitter {
    id: string;

    valid: boolean;

    connectOrderer(tenantId: string, documentId: string): Promise<ISocketOrderer>;
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
    id: string;
    data: any[];
}

export interface INodeMessage {
    // better way to do the before in TS?
    type: "order" | "join" | "op";

    payload: IRawOperationMessage | string | IOpMessage;
}
