import { IClient, IDocumentMessage } from "@prague/container-definitions";
import { IWebSocket } from "./http";

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

export interface IOrdererSocket {
    send(topic: string, op: string, id: string, data: any[]);
}

export interface IOrdererConnection {
    readonly clientId: string;

    readonly tenantId: string;

    readonly documentId: string;

    // TODO - this can probably be phased out in favor of an explicit create of the ordering context
    // For now it maps to whether the connection is to an existing ordering context or a new one
    readonly existing: boolean;

    readonly parentBranch: string;

    readonly maxMessageSize: number;

    order(message: IDocumentMessage): void;

    disconnect(): void;
}

export interface IOrderer {
    connect(socket: IWebSocket, clientId: string, client: IClient): Promise<IOrdererConnection>;

    close(): Promise<void>;
}

export interface IOrdererManager {
    getOrderer(tenantId: string, documentId: string): Promise<IOrderer>;
}
