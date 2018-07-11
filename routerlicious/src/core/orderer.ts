import { IRawOperationMessage } from "./messages";

export interface IOrdererSocket {
    send(op: string, id: string, data: any[]);
}

export interface IOrderer {
    // TODO I might not want to make this sync - just make it enforce actual order
    order(message: IRawOperationMessage, topic: string): Promise<void>;
}

export interface IOrdererManager {
    getOrderer(socket: IOrdererSocket, tenantId: string, documentId: string): Promise<IOrderer>;
}
