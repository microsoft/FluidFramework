import { IOrderer, IOrdererManager } from "../../core";

export class TestOrdererManager implements IOrdererManager {
    public getOrderer(tenantId: string, documentId: string): Promise<IOrderer> {
        return Promise.reject("Implement");
    }

    public route(message) {
        return;
    }
}
