import * as api from "@prague/runtime-definitions";
export declare class SharepointDocumentService implements api.IDocumentService {
    private snapshotUrl;
    private deltaFeedUrl;
    private webSocketUrl;
    constructor(snapshotUrl: string, deltaFeedUrl: string, webSocketUrl: string);
    connectToStorage(tenantId: string, id: string, token: string): Promise<api.IDocumentStorageService>;
    connectToDeltaStorage(tenantId: string, id: string, token: string): Promise<api.IDocumentDeltaStorageService>;
    connectToDeltaStream(tenantId: string, id: string, token: string, client: api.IClient): Promise<api.IDocumentDeltaConnection>;
    branch(tenantId: string, id: string, token: string): Promise<string>;
    getErrorTrackingService(): any;
}
