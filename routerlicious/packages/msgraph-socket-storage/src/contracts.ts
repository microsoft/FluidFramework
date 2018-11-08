import * as api from "@prague/runtime-definitions";

/**
 * Datacontract for sharepoint delta feed response
 */

export interface ISequencedDocumentOp {
    op: api.ISequencedDocumentMessage;
    sequenceNumber: number;
}

export interface IDeltaFeedResponse {
    // There are 2 possible types that c
    value: api.ISequencedDocumentMessage[] | ISequencedDocumentOp[];
}
