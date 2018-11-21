import * as api from "@prague/runtime-definitions";
/**
 * Storage service limited to only being able to fetch documents for a specific document
 */
export declare class DocumentDeltaStorageService implements api.IDocumentDeltaStorageService {
    private tenantId;
    private id;
    private token;
    private storageService;
    constructor(tenantId: string, id: string, token: string, storageService: api.IDeltaStorageService);
    get(from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]>;
}
/**
 * Provides access to the sharepoint delta storage
 */
export declare class SharepointDeltaStorageService implements api.IDeltaStorageService {
    private deltaFeedUrl;
    constructor(deltaFeedUrl: string);
    get(tenantId: string, id: string, token: string, from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]>;
    constructUrl(from?: number, to?: number): string;
}
