import { IClient, IDocumentMessage, IUser } from "@prague/runtime-definitions";
import { IWebSocket } from "../core";

export interface IOrdererSocket {
    send(topic: string, op: string, id: string, data: any[]);
}

export interface IOrdererConnection {
    clientId: string;

    // TODO - this can probably be phased out in favor of an explicit create of the ordering context
    // For now it maps to whether the connection is to an existing ordering context or a new one
    existing: boolean;

    parentBranch: string;

    order(message: IDocumentMessage): void;

    disconnect();
}

export interface IOrderer {
    connect(socket: IWebSocket, user: IUser, client: IClient): Promise<IOrdererConnection>;
    close(): Promise<void>;
}

export interface IOrdererManager {
    getOrderer(tenantId: string, documentId: string): Promise<IOrderer>;
}
