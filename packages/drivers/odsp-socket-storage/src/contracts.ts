import * as api from "@prague/container-definitions";
import * as resources from "@prague/gitresources";

/**
 * Socket storage discovery api response
 */
export interface ISocketStorageDiscovery {
    id: string;
    tenantId: string;

    snapshotStorageUrl: string;
    deltaStorageUrl: string;
    storageToken: string;

    deltaStreamSocketUrl: string;
    socketToken: string;
}

export interface IDeltaStorageGetResponse {
    value: api.ISequencedDocumentMessage[] | ISequencedDeltaOpMessage[];
}

export interface ISequencedDeltaOpMessage {
    op: api.ISequencedDocumentMessage;
    sequenceNumber: number;
}

export interface IDocumentStorageGetVersionsResponse {
    value: resources.ICommit[];
}
