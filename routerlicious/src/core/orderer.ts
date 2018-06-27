import { IRawOperationMessage } from "./messages";

export interface IOrderer {
    order(message: IRawOperationMessage, topic: string): Promise<void>;
}

export interface IOrdererManager {
    getOrderer(socket: any, tenantId: string, documentId: string): Promise<IOrderer>;
}
