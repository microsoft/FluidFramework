import * as api from "@prague/container-definitions";

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

/**
 * Interface for delta storage response.
 * Contains either SequencedDocumentMessages or SequencedDeltaOpMessage.
 */
export interface IDeltaStorageGetResponse {
    value: api.ISequencedDocumentMessage[] | ISequencedDeltaOpMessage[];
}

export interface ISequencedDeltaOpMessage {
    op: api.ISequencedDocumentMessage;
    sequenceNumber: number;
}

export interface IDocumentStorageGetVersionsResponse {
    value: IDocumentStorageVersion[];
}

export interface IDocumentStorageVersion {
    message: string;
    sha: string;
}
