import { IRawOperationMessage } from "./messages";

export interface IOrderer {
    order(message: IRawOperationMessage, topic: string): Promise<void>;
}

export interface IOrdererManager {
    getOrderer(tenantId: string, documentId: string): Promise<IOrderer>;
}
