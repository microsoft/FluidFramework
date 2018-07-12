import { IRawOperationMessage } from "./messages";

export interface IOrdererSocket {
    send(topic: string, op: string, id: string, data: any[]);
}

export interface IOrderer {
    order(message: IRawOperationMessage): void;
}

export interface IOrdererManager {
    getOrderer(socket: IOrdererSocket, tenantId: string, documentId: string): Promise<IOrderer>;
}
